import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    path = Path(os.environ.get("REQUIEM_DB", "var/requiem.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(path, timeout=8)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


@contextmanager
def transaction(write=False):
    db = connect()
    try:
        db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def migrate():
    db = connect()
    try:
        db.execute("PRAGMA journal_mode=WAL")
        for path in sorted((ROOT / "server/migrations").glob("*.sql")):
            version = int(path.stem)
            db.execute("BEGIN IMMEDIATE")
            if db.execute("PRAGMA user_version").fetchone()[0] < version:
                for statement in path.read_text().split(";"):
                    if statement.strip():
                        db.execute(statement)
                db.execute(f"PRAGMA user_version={version}")
            db.commit()
    finally:
        db.close()


def audit(db, user, action, detail):
    db.execute(
        "INSERT INTO audit(user_id,at,action,detail) VALUES(?,?,?,?)",
        (user, now(), action, json.dumps(detail, ensure_ascii=False)),
    )


def records(db, user):
    return [
        dict(
            kind=r["kind"],
            id=r["id"],
            version=r["version"],
            updated=r["updated"],
            data=json.loads(r["body"]),
        )
        for r in db.execute(
            "SELECT * FROM entries WHERE user_id=? ORDER BY updated DESC,id", (user,)
        )
    ]
