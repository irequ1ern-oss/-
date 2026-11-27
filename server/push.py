import json
import os
import time
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, model_validator
from .auth import owner
from .db import transaction
from .models import Model

router = APIRouter(prefix="/api/push")


class Keys(Model):
    auth: str = Field(pattern=r"^[A-Za-z0-9_-]{22}={0,2}$")
    p256dh: str = Field(pattern=r"^[A-Za-z0-9_-]{87}=?$")


class Endpoint(Model):
    endpoint: str = Field(max_length=3000)

    @model_validator(mode="after")
    def check_host(self):
        u = urlsplit(self.endpoint)
        allowed = {
            "fcm.googleapis.com",
            "updates.push.services.mozilla.com",
            "web.push.apple.com",
            "push.apple.com",
        }
        allowed.update(
            h.strip()
            for h in os.environ.get("PUSH_ALLOWED_HOSTS", "").split(",")
            if h.strip()
        )
        if (
            u.scheme != "https"
            or u.hostname not in allowed
            or u.username
            or u.password
            or u.port not in (None, 443)
            or not u.path
            or u.fragment
        ):
            raise ValueError("Неизвестный сервер push")
        return self


class Subscription(Endpoint):
    keys: Keys


def configured():
    return all(
        os.getenv(v) for v in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_CONTACT")
    )


@router.get("/config")
def config(user=Depends(owner)):
    return {"public_key": os.environ["VAPID_PUBLIC_KEY"] if configured() else None}


@router.post("/subscribe")
def subscribe(s: Subscription, user=Depends(owner)):
    if not configured():
        raise HTTPException(503, "Ключи Web Push не настроены")
    with transaction(True) as db:
        previous = db.execute(
            "SELECT user_id FROM push_devices WHERE endpoint=?", (s.endpoint,)
        ).fetchone()
        if previous and previous[0] != user["id"]:
            raise HTTPException(409, "Сначала отключи прежнюю подписку устройства")
        db.execute(
            "INSERT OR REPLACE INTO push_devices VALUES(?,?,?)",
            (s.endpoint, user["id"], s.model_dump_json()),
        )
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(s: Endpoint, user=Depends(owner)):
    with transaction(True) as db:
        db.execute(
            "DELETE FROM push_devices WHERE endpoint=? AND user_id=?",
            (s.endpoint, user["id"]),
        )
    return {"ok": True}


def deliver():
    if not configured():
        return
    from pywebpush import webpush, WebPushException
    import requests

    # Browser push services use direct endpoint URLs. Never follow an endpoint redirect.
    class Direct(requests.Session):
        def request(self, *args, **kwargs):
            kwargs["allow_redirects"] = False
            return super().request(*args, **kwargs)

    ts = int(time.time())
    with transaction(True) as db:
        row = db.execute(
            """SELECT q.*,p.subscription,n.title FROM push_queue q JOIN push_devices p USING(endpoint)
            JOIN notices n ON n.id=q.notice WHERE available<=? ORDER BY available LIMIT 1""",
            (ts,),
        ).fetchone()
        if not row:
            return
        db.execute(
            "UPDATE push_queue SET attempts=attempts+1,available=? WHERE notice=? AND endpoint=?",
            (ts + min(600, 30 * 2 ** row["attempts"]), row["notice"], row["endpoint"]),
        )
    # A late train warning is actively misleading. Give short-lived notices a ten-minute delivery window.
    with transaction() as db:
        fresh = db.execute(
            "SELECT 1 FROM notices WHERE id=? AND julianday(at)>=julianday('now','-10 minutes')",
            (row["notice"],),
        ).fetchone()
    remove = not fresh
    gone = False
    if fresh:
        try:
            with Direct() as session:
                response = webpush(
                    json.loads(row["subscription"]),
                    data=json.dumps(
                        {"id": row["notice"], "title": "Новое уведомление Requiem"}
                    ),
                    vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
                    vapid_claims={"sub": os.environ["VAPID_CONTACT"]},
                    ttl=120,
                    timeout=7,
                    requests_session=session,
                )
                remove = 200 <= response.status_code < 300
        except WebPushException as e:
            gone = e.response is not None and e.response.status_code in {404, 410}
        except (ValueError, requests.RequestException):
            pass
    with transaction(True) as db:
        if gone:
            db.execute("DELETE FROM push_devices WHERE endpoint=?", (row["endpoint"],))
        elif remove or row["attempts"] >= 4:
            db.execute(
                "DELETE FROM push_queue WHERE notice=? AND endpoint=?",
                (row["notice"], row["endpoint"]),
            )
