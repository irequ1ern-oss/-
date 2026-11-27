import os
from urllib.parse import urlsplit
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from .auth import owner, throttle
from .workspace import import_trips, ImportTrips
from .db import transaction, audit

router = APIRouter(prefix="/api/transit")


@router.get("/source")
def source(user=Depends(owner)):
    with transaction() as db:
        row = db.execute(
            "SELECT at FROM audit WHERE user_id=? AND action='transit.refresh' ORDER BY id DESC LIMIT 1",
            (user["id"],),
        ).fetchone()
    return {
        "enabled": bool(os.getenv("TRANSIT_FEED_URL")),
        "updated": row["at"] if row else None,
    }


@router.post("/refresh")
async def refresh(user=Depends(owner)):
    url = os.getenv("TRANSIT_FEED_URL", "")
    if not url or urlsplit(url).scheme != "https":
        raise HTTPException(503, "Внешний источник не подключён")
    throttle("feed:" + str(user["id"]), 6, 600)
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status()
                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > 500000:
                        raise ValueError("feed too large")
        import json

        parsed = ImportTrips(trips=json.loads(buf))
    except (httpx.HTTPError, ValidationError, ValueError, TypeError) as exc:
        raise HTTPException(
            502,
            "Источник недоступен или вернул неверное расписание. Сохранённые данные доступны.",
        ) from exc
    result = import_trips(parsed, user)
    with transaction(True) as db:
        audit(db, user["id"], "transit.refresh", result)
    return result
