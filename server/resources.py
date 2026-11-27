"""Optional read-only source. Server operator binds a single repository to one owner."""

import base64
import os
import re
from pathlib import PurePosixPath
from urllib.parse import quote
import httpx
from fastapi import APIRouter, Depends, HTTPException
from .auth import owner, throttle

router = APIRouter(prefix="/api/resources")


def enabled(user):
    return bool(
        os.getenv("OBSIDIAN_TOKEN")
        and re.fullmatch(r"[\w.-]+/[\w.-]+", os.getenv("OBSIDIAN_REPO", ""))
        and user["username"] == os.getenv("OBSIDIAN_OWNER")
    )


async def github(user, path, params=None):
    if not enabled(user):
        raise HTTPException(503, "Источник материалов не подключён для этого аккаунта")
    throttle("vault:" + str(user["id"]), 30, 60)
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
            r = await client.get(
                "https://api.github.com/repos/" + os.environ["OBSIDIAN_REPO"] + path,
                params=params,
                headers={
                    "Authorization": "Bearer " + os.environ["OBSIDIAN_TOKEN"],
                    "Accept": "application/vnd.github+json",
                },
            )
            r.raise_for_status()
            return r.json()
    except (ValueError, httpx.HTTPError) as exc:
        raise HTTPException(502, "GitHub не вернул материал") from exc


@router.get("/config")
def config(user=Depends(owner)):
    return {"enabled": enabled(user)}


def allowed_path(path):
    parts = path.split("/")
    prefix = os.getenv("OBSIDIAN_PREFIX", "").strip("/")
    return (
        (not prefix or path.startswith(prefix + "/"))
        and not any(p.startswith(".") or not p for p in parts)
        and path.lower().endswith(".md")
    )


@router.get("/search")
async def search(q: str = "", user=Depends(owner)):
    if len(q) > 150:
        raise HTTPException(422, "Слишком длинный запрос")
    ref = quote(os.getenv("OBSIDIAN_REF", "HEAD"), safe="")
    tree = await github(user, "/git/trees/" + ref, {"recursive": "1"})
    matches = [
        t["path"]
        for t in tree.get("tree", [])
        if t.get("type") == "blob"
        and t.get("mode") in {"100644", "100755"}
        and t.get("size", 999999) <= 100000
        and allowed_path(t["path"])
        and q.casefold() in t["path"].casefold()
    ]
    return {
        "paths": matches[:60],
        "truncated": tree.get("truncated", False) or len(matches) > 60,
    }


@router.get("/read")
async def read(path: str, user=Depends(owner)):
    if not allowed_path(path) or len(path) > 600:
        raise HTTPException(422, "Нужна заметка Markdown в разрешённой папке")
    # Resolve the tree entry rather than following a symlink through Contents.
    ref = quote(os.getenv("OBSIDIAN_REF", "HEAD"), safe="")
    tree = await github(user, "/git/trees/" + ref, {"recursive": "1"})
    entry = next(
        (
            t
            for t in tree.get("tree", [])
            if t["path"] == path and t.get("mode") in {"100644", "100755"}
        ),
        None,
    )
    if not entry or entry.get("size", 999999) > 100000:
        raise HTTPException(404, "Материал недоступен")
    item = await github(user, "/git/blobs/" + entry["sha"])
    try:
        text = base64.b64decode(item["content"]).decode("utf-8")
    except (ValueError, KeyError, UnicodeError):
        raise HTTPException(422, "Материал должен быть в UTF-8")
    if len(text) > 32000:
        raise HTTPException(422, "Максимум 32 000 символов на заметку")
    return dict(
        title=PurePosixPath(path).stem,
        text=text,
        link="https://github.com/"
        + os.environ["OBSIDIAN_REPO"]
        + "/blob/"
        + ref
        + "/"
        + quote(path),
    )


async def search_web(query):
    key = os.getenv("BRAVE_SEARCH_KEY")
    if not key:
        return {"error": "Поисковый API не подключён"}
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            r = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": 4},
                headers={"X-Subscription-Token": key, "Accept": "application/json"},
            )
            r.raise_for_status()
            return [
                {
                    "title": i["title"],
                    "url": i["url"],
                    "excerpt": i.get("description", "")[:400],
                }
                for i in r.json().get("web", {}).get("results", [])[:4]
            ]
    except (ValueError, KeyError, httpx.HTTPError):
        return {"error": "Поиск сейчас недоступен"}
