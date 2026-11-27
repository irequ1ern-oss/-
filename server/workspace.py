import json
from collections import Counter
from datetime import date, timedelta
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, ValidationError

from .auth import owner, admin
from .calendar import subjects, lessons, minute, school_now, day_range
from .db import transaction, records, now, audit
from .engine import (
    group,
    grade_summary,
    academic,
    optimize,
    simulate,
    strategy_for,
    PRESETS,
    recovery,
    time_report,
    train_after,
    VERSION,
)
from .models import MODELS, Model, Clock
from .departure import connections, last_pair_options

router = APIRouter(prefix="/api")
KEY = r"^[A-Za-z0-9_.:-]{1,100}$"


class Change(Model):
    kind: str = Field(max_length=32)
    id: str = Field(pattern=KEY)
    version: int = Field(ge=0)
    data: dict[str, Any] | None


class Batch(Model):
    changes: list[Change] = Field(min_length=1, max_length=500)


def reject(msg):
    raise HTTPException(422, msg)


def save_change(db, uid, change):
    kind, key, version = change.kind, change.id, change.version
    cls = MODELS.get(kind)
    if not cls:
        reject("Неизвестный тип записи")
    old = db.execute(
        "SELECT version,body FROM entries WHERE user_id=? AND kind=? AND id=?",
        (uid, kind, key),
    ).fetchone()
    if (old["version"] if old else 0) != version:
        raise HTTPException(409, "Запись уже изменилась. Обнови данные перед повтором.")
    if change.data is None:
        if not old:
            raise HTTPException(404, "Запись уже удалена")
        if (
            kind == "task"
            and db.execute(
                """SELECT 1 FROM entries WHERE user_id=? AND kind='task'
                                           AND json_extract(body,'$.depends')=?""",
                (uid, key),
            ).fetchone()
        ):
            reject("У этой задачи есть зависимые задачи")
        if kind == "task":
            db.execute("DELETE FROM attachments WHERE user_id=? AND task=?", (uid, key))
        db.execute(
            "DELETE FROM entries WHERE user_id=? AND kind=? AND id=?", (uid, kind, key)
        )
        audit(db, uid, "delete", dict(kind=kind, id=key, version=version))
        return
    try:
        data = cls.model_validate(change.data).model_dump(mode="json")
    except ValidationError as e:
        reject(
            "Проверь поле "
            + ".".join(map(str, e.errors()[0]["loc"]))
            + " · "
            + e.errors()[0]["msg"]
        )
    if kind in {"layout", "travel", "chat_settings", "workshop"} and key != "default":
        reject("Используй основную запись профиля")
    if "subject" in data and data["subject"] and data["subject"] not in subjects(db):
        reject("Неизвестный предмет")
    if kind == "subject" and data["subject"] != key:
        reject("Предмету соответствует одна карточка")
    if kind == "attendance":
        if key != data["date"] + "." + data["start"]:
            reject("Неверный идентификатор урока")
        today = school_now()
        if (data["date"], data["start"]) > (
            today.date().isoformat(),
            today.strftime("%H:%M"),
        ):
            reject("Будущий урок доступен в симуляторе")
        match = next(
            (
                l
                for l in lessons(db, date.fromisoformat(data["date"]))
                if l["start"] == data["start"]
            ),
            None,
        )
        prior = json.loads(old["body"]) if old else None
        if not match and not prior:
            reject("На это время нет урока")
        source = prior or match
        data.update(subject=source["subject"], end=source["end"])
        if not prior:
            row = db.execute(
                "SELECT body FROM entries WHERE kind='subject' AND id=? AND user_id=?",
                (data["subject"], uid),
            ).fetchone()
            data["teacher"] = (
                json.loads(row[0])["teacher"]
                if row
                else subjects(db)[data["subject"]].get("teacher", "")
            )
        else:
            data["teacher"] = prior["teacher"]
    if (
        kind == "ledger"
        and db.execute(
            """SELECT 1 FROM entries WHERE user_id=? AND kind='ledger' AND id!=?
          AND json_extract(body,'$.date')=? AND json_extract(body,'$.start')<? AND json_extract(body,'$.end')>?""",
            (uid, key, data["date"], data["end"], data["start"]),
        ).fetchone()
    ):
        reject("Время уже занято другой записью")
    if kind == "task" and data["depends"]:
        dep = data["depends"]
        seen = {key}
        while dep:
            if dep in seen:
                reject("Обнаружена круговая зависимость")
            seen.add(dep)
            row = db.execute(
                "SELECT body FROM entries WHERE user_id=? AND kind='task' AND id=?",
                (uid, dep),
            ).fetchone()
            if not row:
                reject("Предыдущая задача не найдена")
            parent = json.loads(row[0])
            if data["done"] and not parent["done"]:
                reject("Сначала заверши предыдущую задачу")
            dep = parent["depends"]
    db.execute(
        """INSERT INTO entries(user_id,kind,id,version,body,updated) VALUES(?,?,?,?,?,?)
                  ON CONFLICT(user_id,kind,id) DO UPDATE SET version=excluded.version,body=excluded.body,updated=excluded.updated""",
        (uid, kind, key, version + 1, json.dumps(data, ensure_ascii=False), now()),
    )
    audit(db, uid, "save", dict(kind=kind, id=key, version=version + 1))
    if (
        kind == "task"
        and data["done"]
        and data["repeat_days"]
        and old
        and not json.loads(old["body"])["done"]
    ):
        from hashlib import sha256

        due = str(date.fromisoformat(data["due"]) + timedelta(days=data["repeat_days"]))
        next_key = "repeat-" + sha256((key + due).encode()).hexdigest()[:32]
        if not db.execute(
            "SELECT 1 FROM entries WHERE user_id=? AND kind='task' AND id=?",
            (uid, next_key),
        ).fetchone():
            save_change(
                db,
                uid,
                Change(
                    kind="task",
                    id=next_key,
                    version=0,
                    data=dict(data, due=due, spent=0, done=False, depends=""),
                ),
            )


@router.post("/changes")
def changes(form: Batch, user=Depends(owner)):
    with transaction(True) as db:
        for change in form.changes:
            save_change(db, user["id"], change)
    return {"saved": len(form.changes)}


@router.get("/workspace")
def workspace(day: date | None = None, user=Depends(owner)):
    today = school_now().date()
    day = day or today
    with transaction() as db:
        rows = records(db, user["id"])
        g = group(rows)
        ls = lessons(db, day)
        selected = (g["layout"] or [{}])[0].get("strategy", "Balance")
        strategy = strategy_for(g, selected)
        catalog = subjects(db)
        stats = [
            dict(
                academic(g, s, today + timedelta(days=1), strategy),
                grades=grade_summary(g, s),
            )
            for s in catalog
        ]
        tasks = recovery(g, today)
        plans = optimize(g, day, ls, strategy)
        return dict(
            username=user["username"],
            date=str(day),
            today=str(today),
            records=rows,
            subjects=catalog,
            lessons=ls,
            tomorrow=lessons(db, day + timedelta(days=1)),
            stats=stats,
            tasks=tasks,
            scenario=plans[0],
            strategies=list(PRESETS),
            schemas={k: v.model_json_schema() for k, v in MODELS.items()},
            algorithm=VERSION,
        )


class Simulation(Model):
    day: date
    skip: list[Clock] = Field(default_factory=list, max_length=32)
    strategy: str = Field(default="Balance", max_length=100)


def analyze(db, uid, form):
    g = group(records(db, uid))
    ls = lessons(db, form.day)
    try:
        return simulate(g, form.day, ls, form.skip, strategy_for(g, form.strategy))
    except ValueError as e:
        reject(str(e))


@router.post("/simulate")
def scenario(form: Simulation, user=Depends(owner)):
    with transaction() as db:
        return analyze(db, user["id"], form)


@router.post("/decide")
def decide(form: Simulation, user=Depends(owner)):
    with transaction(True) as db:
        plan = analyze(db, user["id"], form)
        if plan["blocked"]:
            reject("Сценарий нарушает ограничения выбранной стратегии")
        key = str(form.day)
        if db.execute(
            "SELECT 1 FROM entries WHERE user_id=? AND kind='decision' AND id=?",
            (user["id"], key),
        ).fetchone():
            raise HTTPException(409, "На этот день уже сохранено решение")
        save_change(
            db,
            user["id"],
            Change(
                kind="decision",
                id=key,
                version=0,
                data=dict(
                    date=str(form.day),
                    starts=form.skip,
                    algorithm=VERSION,
                    estimate=plan["net"],
                ),
            ),
        )
        audit(
            db,
            user["id"],
            "decision",
            dict(day=str(form.day), plan=plan, strategy=form.strategy),
        )
    return {"id": key}


@router.get("/horizon")
def horizon(start: date, days: int = 7, user=Depends(owner)):
    if not 1 <= days <= 366:
        reject("Период от 1 до 366 дней")
    with transaction() as db:
        g = group(records(db, user["id"]))
        result = []
        for d in day_range(start, days):
            ls = lessons(db, d)
            result.append(
                dict(
                    date=str(d),
                    lessons=len(ls),
                    class_minutes=sum(
                        minute(l["end"]) - minute(l["start"]) for l in ls
                    ),
                    deadlines=[
                        t["title"]
                        for t in g["task"]
                        if not t["done"] and t["due"] == str(d)
                    ],
                    train=train_after(g, d, minute(ls[-1]["end"])) if ls else None,
                )
            )
        return result


@router.get("/report")
def report(start: date, end: date, user=Depends(owner)):
    if end < start or (end - start).days > 730:
        reject("Проверь границы периода")
    with transaction() as db:
        g = group(records(db, user["id"]))
        rows = [a for a in g["attendance"] if str(start) <= a["date"] <= str(end)]
        return dict(
            time=time_report(g, start, end),
            attendance=Counter(a["status"] for a in rows),
            weekdays=[
                dict(
                    total=len(day),
                    absent=sum(a["status"] == "absent" for a in day),
                    late=sum(a["status"] == "late" for a in day),
                )
                for i in range(7)
                for day in [
                    [a for a in rows if date.fromisoformat(a["date"]).weekday() == i]
                ]
            ],
        )


@router.get("/audit")
def history(user=Depends(owner)):
    with transaction() as db:
        return [
            dict(r, detail=json.loads(r["detail"]))
            for r in db.execute(
                "SELECT id,at,action,detail FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 500",
                (user["id"],),
            )
        ]


class Interval(Model):
    start: Clock
    end: Clock
    subjectId: str
    room: str = Field(default="", max_length=100)
    rooms: list[str] = Field(default_factory=list, max_length=8)


class CalendarDay(Model):
    day: date
    version: int = Field(ge=0)
    lessons: list[Interval] | None = Field(max_length=32)


@router.get("/calendar")
def calendar_changes():
    with transaction() as db:
        return [
            dict(date=r["date"], version=r["version"], lessons=json.loads(r["body"]))
            for r in db.execute("SELECT * FROM public_calendar ORDER BY date")
        ]


@router.post("/calendar")
def change_calendar(form: CalendarDay, user=Depends(admin)):
    with transaction() as db:
        catalog = subjects(db)
    previous = ""
    for l in form.lessons or []:
        if l.subjectId not in catalog or l.end <= l.start or l.start < previous:
            reject("Проверь предмет, порядок и пересечения уроков")
        previous = l.end
    with transaction(True) as db:
        old = db.execute(
            "SELECT * FROM public_calendar WHERE date=?", (str(form.day),)
        ).fetchone()
        if (old["version"] if old else 0) != form.version:
            raise HTTPException(409, "Расписание изменилось")
        audit(
            db,
            user["id"],
            "calendar",
            dict(day=str(form.day), previous=json.loads(old["body"]) if old else None),
        )
        if form.lessons is None:
            db.execute("DELETE FROM public_calendar WHERE date=?", (str(form.day),))
        else:
            data = [l.model_dump(exclude_defaults=True) for l in form.lessons]
            db.execute(
                "INSERT OR REPLACE INTO public_calendar VALUES(?,?,?,?)",
                (
                    str(form.day),
                    form.version + 1,
                    json.dumps(data, ensure_ascii=False),
                    now(),
                ),
            )
    return {"saved": True}


from .models import Trip, Travel
from .calendar import SCHEDULE


@router.get("/admin/day")
def admin_day(day: date, user=Depends(admin)):
    with transaction() as db:
        row = db.execute(
            "SELECT version,body FROM public_calendar WHERE date=?", (str(day),)
        ).fetchone()
        key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][day.weekday()]
        return dict(
            version=row["version"] if row else 0,
            lessons=json.loads(row["body"]) if row else SCHEDULE["week"].get(key, []),
        )


@router.get("/transit")
def transit(day: date, release: Clock, user=Depends(owner)):
    with transaction() as db:
        g = group(records(db, user["id"]))
        return connections(g, day, minute(release), lessons(db, day))


@router.get("/last-pair")
def compare_departure(day: date, strategy: str = "Balance", user=Depends(owner)):
    with transaction() as db:
        g = group(records(db, user["id"]))
        return last_pair_options(g, day, lessons(db, day), strategy_for(g, strategy))


class ImportTrips(Model):
    route: Travel | None = None
    trips: list[Trip] = Field(min_length=1, max_length=500)


@router.post("/trips/import")
def import_trips(form: ImportTrips, user=Depends(owner)):
    with transaction(True) as db:
        all_rows = records(db, user["id"])
        if form.route:
            saved = next(
                (r for r in all_rows if r["kind"] == "travel" and r["id"] == "default"),
                None,
            )
            if not saved:
                save_change(
                    db,
                    user["id"],
                    Change(
                        kind="travel",
                        id="default",
                        version=0,
                        data=form.route.model_dump(mode="json"),
                    ),
                )
        rows = [r for r in all_rows if r["kind"] == "trip"]
        index = {
            (r["data"]["date"], r["data"]["direction"], r["data"]["number"]): r
            for r in rows
        }
        for trip in form.trips:
            t = trip.model_dump(mode="json")
            key = (t["date"], t["direction"], t["number"])
            r = index.get(key, {"id": str(uuid4()), "version": 0})
            save_change(
                db,
                user["id"],
                Change(kind="trip", id=r["id"], version=r["version"], data=t),
            )
            index[key] = dict(id=r["id"], version=r["version"] + 1)
    return {"saved": len(form.trips)}


@router.get("/optimize")
def period_plan(start: date, days: int = 7, user=Depends(owner)):
    from .engine import optimize_period

    if not 1 <= days <= 366:
        reject("Период 1–366 дней")
    with transaction() as db:
        g = group(records(db, user["id"]))
        strategy = strategy_for(g, (g["layout"] or [{}])[0].get("strategy", "Balance"))
        return optimize_period(db, g, start, days, strategy)


class OfflineBatch(Batch):
    # Optional for installed clients predating automatic sync.
    username: str | None = Field(default=None, min_length=1, max_length=80)


@router.post("/offline/sync")
def sync(form: OfflineBatch, user=Depends(owner)):
    if form.username is not None and form.username != user["username"]:
        raise HTTPException(409, "Офлайн-копия принадлежит другому аккаунту")
    # Drafts are immutable inserts. Retrying after losing the response is safe.
    with transaction(True) as db:
        for c in form.changes:
            if c.kind != "task" or c.version != 0 or not c.data:
                reject("Неверный черновик")
            old = db.execute(
                "SELECT body FROM entries WHERE user_id=? AND kind=? AND id=?",
                (user["id"], c.kind, c.id),
            ).fetchone()
            if old:
                if json.loads(old[0]) != MODELS["task"].model_validate(
                    c.data
                ).model_dump(mode="json"):
                    raise HTTPException(409, "Черновик отличается от записи на сервере")
            else:
                save_change(db, user["id"], c)
    return {"saved": len(form.changes)}


class Restore(Model):
    format: Literal[1]
    records: list[dict] = Field(max_length=2500)


@router.post("/restore")
def restore(form: Restore, user=Depends(owner)):
    # Merge missing records. A differing existing record blocks the whole import.
    with transaction(True) as db:
        existing = {(r["kind"], r["id"]): r for r in records(db, user["id"])}
        batch = {}
        for row in form.records:
            try:
                c = Change(kind=row["kind"], id=row["id"], version=0, data=row["data"])
            except (KeyError, ValidationError):
                reject("Некорректная запись в архиве")
            if not c.data or c.kind not in MODELS:
                reject("Неверный формат данных")
            key = (c.kind, c.id)
            try:
                body = MODELS[c.kind].model_validate(c.data).model_dump(mode="json")
            except ValidationError:
                reject("Неверные поля архивной записи")
            if key in existing and existing[key]["data"] != body:
                raise HTTPException(
                    409, "В архиве и базе есть разные версии одной записи"
                )
            if key in batch:
                reject("Дублирующийся идентификатор в архиве")
            if key not in existing:
                batch[key] = c
        saved = 0
        ordered = sorted(batch, key=lambda key: key[0] != "subject")
        while ordered:
            pending = []
            for key in ordered:
                c = batch[key]
                dep = c.data.get("depends") if c.kind == "task" else None
                if dep and ("task", dep) not in existing:
                    pending.append(key)
                    continue
                save_change(db, user["id"], c)
                existing[key] = {"data": c.data}
                saved += 1
            if len(pending) == len(ordered):
                reject("Проверь зависимости импортируемых задач")
            ordered = pending
        audit(db, user["id"], "import", {"count": saved})
    return {"saved": saved}


class PublicSubject(Model):
    id: str = Field(pattern=r"^[a-z0-9_]{1,40}$")
    short: str = Field(min_length=1, max_length=40)
    full: str = Field(min_length=1, max_length=220)
    teacher: str = Field(default="", max_length=120)
    version: int = Field(ge=0)


@router.get("/catalog")
def public_catalog():
    with transaction() as db:
        return list(subjects(db).values())


@router.post("/catalog")
def update_subject(form: PublicSubject, user=Depends(admin)):
    with transaction(True) as db:
        before = subjects(db).get(form.id)
        if (before or {}).get("version", 0) != form.version:
            raise HTTPException(409, "Карточка уже изменилась")
        data = dict(before or {}, **form.model_dump(exclude={"version"}))
        data.pop("version", None)
        db.execute(
            "INSERT OR REPLACE INTO catalog VALUES(?,?,?)",
            (form.id, form.version + 1, json.dumps(data, ensure_ascii=False)),
        )
        audit(db, user["id"], "catalog", dict(id=form.id, previous=before))
    return {"saved": True}
