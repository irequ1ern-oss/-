import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .db import audit, transaction

router = APIRouter(prefix="/api")
TTL = 7 * 86400


def origin():
    value = os.environ.get("REQUIEM_ORIGIN", "").rstrip("/")
    parsed = urlsplit(value)
    local = parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    if (
        not parsed.hostname
        or parsed.path
        or parsed.query
        or parsed.fragment
        or parsed.username
        or not (parsed.scheme == "https" or local and parsed.scheme == "http")
    ):
        raise RuntimeError(
            "Set REQUIEM_ORIGIN to the external HTTPS origin (or HTTP on loopback)."
        )
    return value


def cookie_name():
    return "__Host-requiem" if origin().startswith("https:") else "requiem-local"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def derive(password, salt):
    return hashlib.scrypt(
        password.encode(), salt=salt, n=2**15, r=8, p=3, maxmem=64 << 20
    ).hex()


def hash_password(password):
    if not 12 <= len(password) <= 128:
        raise ValueError("Пароль должен содержать от 12 до 128 символов")
    salt = secrets.token_bytes(16)
    return salt.hex() + "." + derive(password, salt)


def matches(password, encoded):
    salt, expected = encoded.split(".")
    return hmac.compare_digest(derive(password, bytes.fromhex(salt)), expected)


def throttle(key, maximum, period):
    ts = int(time.time())
    with transaction(True) as db:
        db.execute("DELETE FROM limits WHERE until<=?", (ts,))
        db.execute(
            "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
            (key, ts + period),
        )
        count = db.execute(
            "SELECT count FROM limits WHERE bucket=?", (key,)
        ).fetchone()[0]
    if count > maximum:
        raise HTTPException(429, "Слишком много запросов. Попробуй позже.")


def current(request: Request):
    token = request.cookies.get(cookie_name(), "")
    with transaction() as db:
        row = db.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                            WHERE s.token=? AND s.expires>?""",
            (digest(token), int(time.time())),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Нужен вход в аккаунт")
    return dict(row)


def owner(user=Depends(current)):
    if not user["owner"]:
        raise HTTPException(403, "Нужна роль владельца")
    return user


def admin(user=Depends(current)):
    if not user["admin"]:
        raise HTTPException(403, "Нужна роль администратора")
    return user


def identity(user):
    return {
        "username": user["username"],
        "owner": bool(user["owner"]),
        "admin": bool(user["admin"]),
    }


def new_session(db, user, response):
    token = secrets.token_urlsafe(32)
    ts = int(time.time())
    db.execute("DELETE FROM sessions WHERE expires<=?", (ts,))
    db.execute("INSERT INTO sessions VALUES(?,?,?)", (digest(token), user, ts + TTL))
    response.set_cookie(
        cookie_name(),
        token,
        httponly=True,
        secure=origin().startswith("https:"),
        samesite="strict",
        path="/",
        max_age=TTL,
    )


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class Password(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current: str = Field(min_length=1, max_length=128)
    replacement: str = Field(min_length=12, max_length=128)


@router.post("/login")
def login(form: Credentials, request: Request, response: Response):
    throttle(
        "auth-host:" + digest(request.client.host if request.client else ""), 30, 900
    )
    throttle("auth-user:" + digest(form.username.strip().casefold()), 12, 900)
    with transaction() as db:
        user = db.execute(
            "SELECT * FROM users WHERE username=?", (form.username.strip(),)
        ).fetchone()
    encoded = user["password"] if user else "00" * 16 + "." + "00" * 64
    if not matches(form.password, encoded) or not user:
        raise HTTPException(401, "Проверь логин и пароль")
    with transaction(True) as db:
        if (
            db.execute("SELECT epoch FROM users WHERE id=?", (user["id"],)).fetchone()[
                0
            ]
            != user["epoch"]
        ):
            raise HTTPException(401, "Повтори вход")
        new_session(db, user["id"], response)
        audit(db, user["id"], "login", {})
    return identity(user)


@router.get("/session")
def session(user=Depends(current)):
    return identity(user)


@router.post("/logout")
def logout(request: Request, response: Response):
    with transaction(True) as db:
        db.execute(
            "DELETE FROM sessions WHERE token=?",
            (digest(request.cookies.get(cookie_name(), "")),),
        )
    response.delete_cookie(
        cookie_name(),
        path="/",
        secure=origin().startswith("https:"),
        httponly=True,
        samesite="strict",
    )
    return {"ok": True}


@router.post("/password")
def password(form: Password, response: Response, user=Depends(current)):
    throttle("password:" + str(user["id"]), 8, 900)
    if not matches(form.current, user["password"]):
        raise HTTPException(400, "Проверь текущий пароль")
    encoded = hash_password(form.replacement)
    with transaction(True) as db:
        if not db.execute(
            "UPDATE users SET password=?,epoch=epoch+1 WHERE id=? AND epoch=?",
            (encoded, user["id"], user["epoch"]),
        ).rowcount:
            raise HTTPException(409, "Сессия изменилась. Повтори вход")
        db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        new_session(db, user["id"], response)
        audit(db, user["id"], "password.changed", {})
    return {"ok": True}
