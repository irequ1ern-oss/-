import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError

from . import auth, workspace, assistant, feed, oracle, push, resources, extras, claim
from .db import migrate, ROOT


@asynccontextmanager
async def lifespan(app):
    auth.origin()
    migrate()
    job = asyncio.create_task(oracle.scheduler())
    try:
        yield
    finally:
        job.cancel()
        with suppress(asyncio.CancelledError):
            await job


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(auth.router)
app.include_router(workspace.router)
app.include_router(assistant.router)
app.include_router(feed.router)
app.include_router(oracle.router)
app.include_router(push.router)
app.include_router(resources.router)
app.include_router(extras.router)
app.include_router(claim.router)


@app.exception_handler(RequestValidationError)
async def invalid(request, exc):
    # Validation errors can contain submitted credentials. Only return field names.
    return JSONResponse(
        {
            "detail": "Проверь поля формы: "
            + ", ".join(".".join(map(str, e["loc"][1:])) for e in exc.errors())
        },
        422,
    )


@app.middleware("http")
async def boundary(request: Request, call_next):
    api = request.url.path.startswith("/api/")
    if api and request.method not in {"GET", "HEAD", "OPTIONS"}:
        if request.headers.get("origin") != auth.origin():
            return JSONResponse({"detail": "Недопустимый источник запроса"}, 403)
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return JSONResponse({"detail": "Требуется JSON"}, 415)
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 750_000:
                return JSONResponse({"detail": "Слишком большой запрос"}, 413)
            if not hasattr(request.state, "payload"):
                request.state.payload = bytearray()
            request.state.payload.extend(chunk)
        request._body = bytes(getattr(request.state, "payload", b""))
    result = await call_next(request)
    result.headers["X-Content-Type-Options"] = "nosniff"
    result.headers["Referrer-Policy"] = "no-referrer"
    result.headers["X-Frame-Options"] = "DENY"
    if api or request.url.path.startswith("/account"):
        result.headers["Cache-Control"] = "no-store"
    if (
        request.url.path in {"/api/calendar", "/api/catalog"}
        and request.method == "GET"
    ):
        result.headers["Access-Control-Allow-Origin"] = "*"
    if request.url.path.startswith("/account"):
        result.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
    return result


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/account")
def account():
    return RedirectResponse("/account/")


def mount_static():
    app.mount(
        "/",
        StaticFiles(directory=ROOT / "dist", html=True, check_dir=False),
        name="application",
    )


mount_static()
