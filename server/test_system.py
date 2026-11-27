import json
import os
import tempfile
import unittest
from datetime import date, datetime
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from .auth import hash_password
from .db import migrate, transaction, records
from .engine import budget, group, train_after, PRESETS, simulate, academic
from .main import app
from .oracle import evaluate, process
from .models import Rule
from .assistant import tool

DAY = "2026-11-26"
ORIGIN = "https://testserver"
SECRET = "isolated-test-fixture"


def trip(n, dep, arr, **kwargs):
    return (
        dict(
            date=DAY,
            number=n,
            departure=dep,
            arrival=arr,
            direction="out",
            overnight=False,
            cancelled=False,
            delay=0,
            **kwargs
        )
        if not kwargs
        else dict(
            dict(
                date=DAY,
                number=n,
                departure=dep,
                arrival=arr,
                direction="out",
                overnight=False,
                cancelled=False,
                delay=0,
            ),
            **kwargs
        )
    )


class EngineTests(unittest.TestCase):
    def test_budget_bounds(self):
        self.assertIsNone(budget(0, 0, None, 80, 1)["percent"])
        self.assertEqual(
            budget(8, 10, 10, 80, 1),
            dict(percent=80.0, required=8, reserve=1, attainable=True),
        )
        self.assertTrue(budget(8, 10, 0, 80, 1)["attainable"])
        self.assertFalse(budget(5, 10, 2, 80, 0)["attainable"])
        self.assertEqual(budget(60, 75, 45, 80, 10)["reserve"], 0)
        self.assertEqual(budget(0, 0, 7, 0, 2)["reserve"], 5)

    def test_boarding_boundaries_and_midnight(self):
        g = group([])
        g["trip"] = [
            trip("A", "16:40", "18:09"),
            trip("B", "18:10", "19:41"),
            trip("N", "23:48", "01:12", overnight=True),
        ]
        self.assertFalse(train_after(g, DAY, 940)["tight"])
        self.assertTrue(train_after(g, DAY, 945)["tight"])
        self.assertEqual(train_after(g, DAY, 946)["number"], "B")
        self.assertEqual(train_after(g, DAY, 1350)["arr"], 1512)
        self.assertIsNone(train_after(g, "2026-11-27", 0))
        self.assertIsNone(train_after(g, DAY, 1400))
        g["trip"][0]["cancelled"] = True
        self.assertEqual(train_after(g, DAY, 900)["number"], "B")

    def test_net_time_and_unknowns(self):
        g = group([])
        dd = date.fromisoformat(DAY)
        ls = [
            dict(subject="ig", start="14:50", end="15:35"),
            dict(subject="pe", start="15:45", end="16:30"),
        ]
        unknown = simulate(g, dd, ls, ["15:45"], PRESETS["Balance"])
        self.assertIsNone(unknown["net"])
        self.assertTrue(unknown["unknown"])
        self.assertTrue(unknown["blocked"])
        g["trip"] = [trip("A", "16:40", "18:09"), trip("B", "18:10", "19:41")]
        s = simulate(g, dd, ls, ["15:45"], PRESETS["Balance"])
        self.assertEqual((s["away_saved"], s["makeup"], s["net"]), (92, 30, 62))
        g["trip"] = g["trip"][1:]
        self.assertEqual(
            simulate(g, dd, ls, ["15:45"], PRESETS["Balance"])["away_saved"], 0
        )

    def test_excused_and_minutes(self):
        g = group([])
        g["subject"] = [dict(subject="ig", unit="minute")]
        for mark, a, b in [
            ("present", "09:00", "09:45"),
            ("absent", "10:00", "10:30"),
            ("excused", "12:00", "12:45"),
        ]:
            g["attendance"].append(
                dict(subject="ig", date=DAY, start=a, end=b, status=mark)
            )
        stat = academic(g, "ig", date(2026, 11, 27), PRESETS["Balance"])
        self.assertEqual(
            (stat["attended"], stat["total"], stat["percent"]), (45, 75, 60)
        )


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pwd = hash_password(SECRET)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(
            os.environ,
            {
                "REQUIEM_ORIGIN": ORIGIN,
                "REQUIEM_DB": self.temp.name + "/app.db",
                "ALL_PROXY": "",
                "all_proxy": "",
                "HTTP_PROXY": "",
                "http_proxy": "",
                "HTTPS_PROXY": "",
                "https_proxy": "",
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(app, base_url=ORIGIN, headers={"origin": ORIGIN})
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        with transaction(True) as db:
            for name, o, a in [("one", 1, 1), ("two", 1, 0), ("staff", 0, 1)]:
                db.execute(
                    "INSERT INTO users(username,password,owner,admin) VALUES(?,?,?,?)",
                    (name, self.pwd, o, a),
                )

    def login(self, name="one"):
        r = self.client.post("/api/login", json=dict(username=name, password=SECRET))
        self.assertEqual(r.status_code, 200, r.text)
        return r

    def put(self, kind, key, data, version=0):
        return self.client.post(
            "/api/changes",
            json={"changes": [dict(kind=kind, id=key, version=version, data=data)]},
        )

    def test_guest_roles_session_rotation_and_logout(self):
        self.assertEqual(self.client.get("/api/workspace").status_code, 401)
        r = self.login()
        self.assertIn("HttpOnly", r.headers["set-cookie"])
        self.assertIn("Secure", r.headers["set-cookie"])
        self.assertEqual(self.client.get("/api/session").json()["username"], "one")
        prior = dict(self.client.cookies)
        self.assertEqual(
            self.client.post(
                "/api/password",
                json={"current": SECRET, "replacement": SECRET + "-new"},
            ).status_code,
            200,
        )
        with TestClient(app, base_url=ORIGIN, cookies=prior) as other:
            self.assertEqual(other.get("/api/session").status_code, 401)
        self.assertEqual(self.client.post("/api/logout", json={}).status_code, 200)
        self.assertEqual(self.client.get("/api/workspace").status_code, 401)
        self.login("staff")
        self.assertEqual(self.client.get("/api/workspace").status_code, 403)
        self.assertEqual(self.client.get("/api/ai/history").status_code, 403)
        self.login("two")
        self.assertEqual(self.client.get("/api/admin/day?day=" + DAY).status_code, 403)

    def test_owner_isolation_validation_conflict_and_atomicity(self):
        self.login()
        note = dict(title="Private", text="private note")
        self.assertEqual(self.put("note", "id", note).status_code, 200)
        self.assertEqual(self.put("note", "id", note).status_code, 409)
        r = self.client.post(
            "/api/changes",
            json={
                "changes": [
                    dict(kind="note", id="x", version=0, data=note),
                    dict(kind="note", id="y", version=0, data={"unexpected": 0}),
                ]
            },
        )
        self.assertEqual(r.status_code, 422)
        with transaction() as db:
            self.assertEqual(len(records(db, 1)), 1)
        self.login("two")
        self.assertEqual(self.client.get("/api/workspace").json()["records"], [])
        self.assertEqual(self.put("note", "id", None, 1).status_code, 409)
        self.assertEqual(
            self.client.post(
                "/api/changes",
                headers={"origin": "https://other.invalid"},
                json={"changes": []},
            ).status_code,
            403,
        )

    def test_migration_preserves_records(self):
        self.login()
        self.put("note", "n", dict(title="x", text="y"))
        migrate()
        migrate()
        with transaction() as db:
            self.assertEqual(records(db, 1)[0]["data"]["text"], "y")

    def test_overlap_and_dependencies(self):
        self.login()
        a = dict(date=DAY, start="10:00", end="11:00", category="travel")
        self.assertEqual(self.put("ledger", "a", a).status_code, 200)
        self.assertEqual(
            self.put("ledger", "b", dict(a, start="10:15")).status_code, 422
        )
        self.assertEqual(
            self.put("ledger", "b", dict(a, start="11:00", end="11:50")).status_code,
            200,
        )
        t = dict(title="A", due=DAY)
        self.put("task", "a", t)
        self.put("task", "b", dict(t, depends="a"))
        self.assertEqual(
            self.put("task", "a", dict(t, depends="b"), 1).status_code, 422
        )
        self.assertEqual(
            self.put("task", "b", dict(t, depends="a", done=True), 1).status_code, 422
        )

    def test_cancelled_day_and_forecast_separate(self):
        self.login()
        r = self.client.post("/api/calendar", json=dict(day=DAY, version=0, lessons=[]))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            self.client.get("/api/workspace?day=" + DAY).json()["lessons"], []
        )
        self.assertEqual(
            self.client.post(
                "/api/simulate", json=dict(day=DAY, skip=["15:45"])
            ).status_code,
            422,
        )
        self.assertEqual(
            self.put(
                "attendance",
                DAY + ".09:00",
                dict(
                    date=DAY, start="09:00", end="09:45", subject="ig", status="absent"
                ),
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.get("/api/optimize?start=" + DAY + "&days=7").status_code, 200
        )
        with transaction() as db:
            self.assertEqual(records(db, 1), [])

    def test_transit_import_retry_and_provider_unavailable(self):
        self.login()
        rows = [trip("x", "10:00", "11:00")]
        for _ in range(2):
            self.assertEqual(
                self.client.post("/api/trips/import", json={"trips": rows}).status_code,
                200,
            )
        self.assertEqual(len(self.client.get("/api/workspace").json()["records"]), 1)
        with patch.dict(
            os.environ, {"TRANSIT_FEED_URL": "https://example.invalid/feed"}
        ), patch("httpx.AsyncClient.stream", side_effect=httpx.ConnectError("offline")):
            self.assertEqual(
                self.client.post("/api/transit/refresh", json={}).status_code, 502
            )
        self.assertEqual(len(self.client.get("/api/workspace").json()["records"]), 1)

    def test_ai_invalid_and_approval_scoped_single_use(self):
        self.login()
        with transaction(True) as db:
            with self.assertRaises(ValidationError):
                tool(db, 1, "create_task", {"title": "x", "due": "bad"})
            with self.assertRaises(ValueError):
                tool(db, 1, "unregistered", {})
            proposal = tool(db, 1, "create_task", dict(title="Draft", due=DAY))[
                "proposal"
            ]
            self.assertFalse(records(db, 1))
        self.login("two")
        self.assertEqual(
            self.client.post("/api/ai/apply", json={"id": proposal}).status_code, 409
        )
        self.login()
        self.assertEqual(
            self.client.post("/api/ai/apply", json={"id": proposal}).status_code, 200
        )
        self.assertEqual(
            self.client.post("/api/ai/apply", json={"id": proposal}).status_code, 409
        )
        with patch.dict(os.environ, {"SHAY_OPENAI_KEY": ""}):
            self.assertEqual(
                self.client.post("/api/ai/ask", json={"text": "Привет"}).status_code,
                503,
            )

    def test_ai_two_round_trip_and_usage(self):
        self.login()
        outputs = [
            dict(
                role="assistant",
                content=None,
                tool_calls=[
                    dict(
                        type="function",
                        id="call-1",
                        function=dict(
                            name="get_schedule", arguments=json.dumps({"day": DAY})
                        ),
                    )
                ],
            ),
            dict(role="assistant", content="Урок начинается в 09:00."),
        ]
        mock = AsyncMock(
            side_effect=[
                httpx.Response(
                    200,
                    request=httpx.Request("POST", "https://example.invalid"),
                    json=dict(choices=[{"message": o}], usage={"total_tokens": 52}),
                )
                for o in outputs
            ]
        )
        with patch.dict(
            os.environ,
            {
                "SHAY_OPENAI_KEY": "test-only",
                "SHAY_OPENAI_MODELS": "fixture",
                "SHAY_PROVIDER": "openai",
            },
        ), patch("httpx.AsyncClient.post", mock):
            result = self.client.post("/api/ai/ask", json={"text": "Расписание"})
            self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["tools"], [{"name": "get_schedule"}])
        with transaction() as db:
            self.assertEqual(
                db.execute("SELECT tokens FROM ai_usage").fetchone()[0], 104
            )

    def test_clock_rule_dedup_and_quiet(self):
        self.login()
        r = dict(title="Брифинг", when="morning")
        self.put("rule", "one", r)
        stamp = datetime.fromisoformat(DAY + "T05:40")
        process(stamp)
        process(stamp)
        self.assertEqual(len(self.client.get("/api/oracle/notices").json()), 1)
        rule = Rule.model_validate(dict(r, at="01:00")).model_dump()
        self.assertIsNone(
            evaluate(rule, group([]), [], stamp.replace(hour=1, minute=0))
        )


if __name__ == "__main__":
    unittest.main()
