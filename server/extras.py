import base64
import re
from urllib.parse import quote
from uuid import uuid4
from fastapi import APIRouter, Depends, Response, HTTPException
from pydantic import Field
from .auth import owner
from .db import transaction, audit, records
from .models import Model, Title
from .workspace import Change, save_change, reject

router = APIRouter(prefix="/api")


class Attachment(Model):
    task: Title
    name: Title
    content: str = Field(max_length=690000)


class Ref(Model):
    id: Title


@router.get("/files")
def files(task: str, user=Depends(owner)):
    with transaction() as db:
        return [
            dict(r)
            for r in db.execute(
                "SELECT id,name,length(body) size FROM attachments WHERE user_id=? AND task=?",
                (user["id"], task),
            )
        ]


@router.post("/files/add")
def attach(form: Attachment, user=Depends(owner)):
    try:
        data = base64.b64decode(form.content, validate=True)
    except ValueError:
        reject("Неверная кодировка вложения")
    if not 0 < len(data) <= 500000:
        reject("Вложение должно быть до 500 КБ")
    name = form.name.replace("/", "_").replace(chr(92), "_")
    if re.search(r"[\x00-\x1f]", name):
        reject("Недопустимое имя файла")
    with transaction(True) as db:
        if not db.execute(
            "SELECT 1 FROM entries WHERE user_id=? AND kind='task' AND id=?",
            (user["id"], form.task),
        ).fetchone():
            raise HTTPException(404, "Задача не найдена")
        if (
            db.execute(
                "SELECT COALESCE(SUM(length(body)),0) FROM attachments WHERE user_id=?",
                (user["id"],),
            ).fetchone()[0]
            + len(data)
            > 32_000_000
        ):
            raise HTTPException(413, "Исчерпан лимит вложений аккаунта")
        key = str(uuid4())
        db.execute(
            "INSERT INTO attachments VALUES(?,?,?,?,?)",
            (user["id"], key, form.task, name, data),
        )
        audit(db, user["id"], "attachment.add", {"task": form.task, "id": key})
    return {"id": key}


@router.get("/files/{key}")
def download_file(key: str, user=Depends(owner)):
    with transaction() as db:
        r = db.execute(
            "SELECT name,body FROM attachments WHERE user_id=? AND id=?",
            (user["id"], key),
        ).fetchone()
    if not r:
        raise HTTPException(404, "Файл не найден")
    return Response(
        r["body"],
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(r["name"], safe=""),
            "Content-Security-Policy": "sandbox",
        },
    )


@router.post("/files/remove")
def remove_file(form: Ref, user=Depends(owner)):
    with transaction(True) as db:
        if not db.execute(
            "DELETE FROM attachments WHERE user_id=? AND id=?", (user["id"], form.id)
        ).rowcount:
            raise HTTPException(404, "Файл не найден")
        audit(db, user["id"], "attachment.remove", {"id": form.id})
    return {"ok": True}


@router.get("/memory/review")
def review(user=Depends(owner)):
    with transaction() as db:
        rows = [
            r
            for r in records(db, user["id"])
            if r["kind"] == "memory" and r["data"]["active"]
        ]
    groups = {}
    for r in rows:
        d = r["data"]
        groups.setdefault(
            (d["category"], " ".join(d["title"].casefold().split())), []
        ).append(r)
    return [
        {
            "kind": (
                "duplicate"
                if len({" ".join(r["data"]["text"].casefold().split()) for r in group})
                == 1
                else "review"
            ),
            "items": [
                dict(
                    id=r["id"],
                    version=r["version"],
                    text=r["data"]["text"],
                    title=r["data"]["title"],
                )
                for r in group
            ],
        }
        for group in groups.values()
        if len(group) > 1
    ]


class Merge(Model):
    keep: Title
    retire: Title
    version: int = Field(ge=1)
    keep_version: int = Field(ge=1)


@router.post("/memory/merge")
def merge(form: Merge, user=Depends(owner)):
    with transaction(True) as db:
        rows = {r["id"]: r for r in records(db, user["id"]) if r["kind"] == "memory"}
        keep, old = rows.get(form.keep), rows.get(form.retire)
        if not keep or not old or keep["id"] == old["id"]:
            reject("Выбери две записи")
        if keep["version"] != form.keep_version:
            raise HTTPException(409, "Основная запись изменилась")
        save_change(
            db,
            user["id"],
            Change(
                kind="memory",
                id=old["id"],
                version=form.version,
                data=dict(old["data"], active=False),
            ),
        )
        audit(
            db, user["id"], "memory.merge", {"kept": keep["id"], "archived": old["id"]}
        )
    return {"ok": True}
