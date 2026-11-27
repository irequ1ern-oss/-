import json
from datetime import timedelta, datetime
from zoneinfo import ZoneInfo
from .db import ROOT

MSK = ZoneInfo("Europe/Moscow")
SCHEDULE = json.loads((ROOT / "data/schedule.json").read_text())
BELLS = json.loads((ROOT / "data/bells.json").read_text())
SUBJECTS = {s["id"]: s for s in SCHEDULE["subjects"]}


def school_now():
    return datetime.now(MSK)


def minute(clock):
    h, m = map(int, clock.split(":"))
    return h * 60 + m


def lessons(db, day):
    row = db.execute(
        "SELECT body FROM public_calendar WHERE date=?", (str(day),)
    ).fetchone()
    week = SCHEDULE["week"]
    key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][day.weekday()]
    raw = json.loads(row[0]) if row else week.get(key, [])
    result = []
    catalog = subjects(db)
    for item in raw:
        start, end = item["start"], item["end"]
        pair = next((b for b in BELLS if b["start"] == start and b["end"] == end), None)
        slots = (
            [(start, pair["pause"]), (pair["resume"], end)] if pair else [(start, end)]
        )
        for a, b in slots:
            result.append(
                dict(
                    date=str(day),
                    start=a,
                    end=b,
                    subject=item["subjectId"],
                    title=catalog[item["subjectId"]]["short"],
                    room=item.get("room") or " / ".join(item.get("rooms", [])),
                )
            )
    return result


def day_range(start, count):
    return [start + timedelta(days=i) for i in range(count)]


def subjects(db):
    result = {k: dict(v, teacher="", version=0) for k, v in SUBJECTS.items()}
    for row in db.execute("SELECT * FROM catalog"):
        result[row["id"]] = dict(json.loads(row["body"]), version=row["version"])
    return result
