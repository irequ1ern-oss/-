"""Idempotent clock-based rules. Notifications never write new rules or academic facts."""

import asyncio
import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from .auth import owner
from .calendar import lessons, school_now, minute
from .engine import group, train_after
from .db import transaction, records, now, audit
from .models import Model, Title

router = APIRouter(prefix="/api/oracle")
log = logging.getLogger(__name__)


def evaluate(rule, g, ls, stamp):
    day = stamp.date()
    at = stamp.hour * 60 + stamp.minute
    start, end = minute(rule["quiet_start"]), minute(rule["quiet_end"])
    if start <= at < end if start <= end else at >= start or at < end:
        return None
    if not rule["enabled"] or rule["weekdays_only"] and day.weekday() > 4:
        return None
    values = []
    if rule["require_lessons"]:
        values.append(bool(ls))
    if rule["require_debts"]:
        values.append(any(t["category"] == "debt" and not t["done"] for t in g["task"]))
    if values and not (all(values) if rule["condition_mode"] == "AND" else any(values)):
        return None
    kind = rule["when"]
    target = minute(rule["at"])
    message = None
    if kind == "departure":
        if not ls:
            return None
        train = train_after(g, day, minute(ls[-1]["end"]))
        if not train:
            return None
        target = train["leave"] - rule["lead"]
        message = f"До комфортного выхода {rule['lead']} мин · рейс {train['number']}"
    elif kind == "deadline":
        due = [
            t["title"]
            for t in g["task"]
            if not t["done"] and str(day) <= t["due"] <= str(day + timedelta(days=1))
        ]
        if due:
            message = "Срок сегодня или завтра · " + ", ".join(due[:4])
    elif kind == "morning":
        message = f"Сегодня {len(ls)} уроков" + (
            " · первый в " + ls[0]["start"] if ls else ""
        )
    else:
        message = f"Не завершено задач: {sum(not t['done'] for t in g['task'])}"
    if message and target <= at < target + 2:
        return message
    return None


def process(stamp):
    with transaction(True) as db:
        uids = db.execute(
            "SELECT DISTINCT e.user_id FROM entries e JOIN users u ON u.id=e.user_id WHERE e.kind='rule' AND u.owner=1"
        ).fetchall()
        for row in uids:
            uid = row[0]
            g = group(records(db, uid))
            ls = lessons(db, stamp.date())
            for rule in g["rule"]:
                message = evaluate(rule, g, ls, stamp)
                if message:
                    key = str(stamp.date()) + ":" + rule["_id"]
                    inserted = db.execute(
                        "INSERT OR IGNORE INTO notices(user_id,event,at,title) VALUES(?,?,?,?)",
                        (uid, key, now(), message),
                    )
                    if inserted.rowcount:
                        audit(
                            db, uid, "oracle.notice", dict(rule=rule["_id"], event=key)
                        )
                        db.execute(
                            "INSERT INTO push_queue(notice,endpoint,available) SELECT ?,endpoint,0 FROM push_devices WHERE user_id=?",
                            (inserted.lastrowid, uid),
                        )


async def scheduler():
    while True:
        try:
            from .push import deliver

            await asyncio.to_thread(process, school_now())
            await asyncio.to_thread(deliver)
        except Exception:
            log.exception("Scheduled rule evaluation failed")
        await asyncio.sleep(30)


@router.get("/notices")
def notices(user=Depends(owner)):
    with transaction() as db:
        return [
            dict(r)
            for r in db.execute(
                "SELECT id,at,title,seen FROM notices WHERE user_id=? ORDER BY id DESC LIMIT 80",
                (user["id"],),
            )
        ]


class Probe(Model):
    id: Title
    at: str


@router.post("/test")
def test_rule(form: Probe, user=Depends(owner)):
    from datetime import datetime

    try:
        stamp = datetime.fromisoformat(form.at)
    except ValueError:
        raise HTTPException(422, "Проверь дату и время")
    with transaction() as db:
        g = group(records(db, user["id"]))
        r = next((r for r in g["rule"] if r["_id"] == form.id), None)
        if not r:
            raise HTTPException(404, "Правило не найдено")
        return {"message": evaluate(r, g, lessons(db, stamp.date()), stamp)}
