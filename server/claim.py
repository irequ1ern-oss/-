"""One-time owner enrolment using an operator-provisioned secret, with no public signup."""

import hmac
import os
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import Field
from .auth import Credentials, hash_password, identity, new_session, throttle
from .db import transaction, audit
from .workspace import Change, save_change, ImportTrips

router = APIRouter(prefix="/api")


class Claim(Credentials):
    password: str = Field(min_length=12, max_length=128)
    code: str = Field(min_length=32, max_length=160)


@router.post("/activate")
def activate(form: Claim, request: Request, response: Response):
    throttle("activation", 12, 300)
    secret = os.getenv("REQUIEM_ACTIVATION_CODE", "")
    if len(secret) < 32 or not hmac.compare_digest(secret.encode(), form.code.encode()):
        raise HTTPException(403, "Активация недоступна или код неверен")
    username = form.username.strip()
    if not username:
        raise HTTPException(422, "Укажи логин")
    encoded = hash_password(form.password)
    with transaction(True) as db:
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            raise HTTPException(409, "Аккаунт уже активирован")
        uid = db.execute(
            "INSERT INTO users(username,password,owner,admin) VALUES(?,?,1,1)",
            (username, encoded),
        ).lastrowid
        seed = os.getenv("REQUIEM_FIRST_ROUTE")
        if seed:
            initial = ImportTrips.model_validate_json(seed)
            if initial.route:
                save_change(
                    db,
                    uid,
                    Change(
                        kind="travel",
                        id="default",
                        version=0,
                        data=initial.route.model_dump(mode="json"),
                    ),
                )
            for i, trip in enumerate(initial.trips):
                save_change(
                    db,
                    uid,
                    Change(
                        kind="trip",
                        id="initial-" + str(i),
                        version=0,
                        data=trip.model_dump(mode="json"),
                    ),
                )
        new_session(db, uid, response)
        audit(db, uid, "owner.activated", {})
    return identity(dict(username=username, owner=1, admin=1))
