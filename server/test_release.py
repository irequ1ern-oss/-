import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from .main import app
from .test_system import ORIGIN, SECRET


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        env = patch.dict(
            os.environ,
            dict(
                REQUIEM_ORIGIN=ORIGIN,
                REQUIEM_DB=t.name + "/db",
                REQUIEM_ACTIVATION_CODE="T" * 40,
            ),
        )
        env.start()
        self.addCleanup(env.stop)
        self.c = TestClient(app, base_url=ORIGIN, headers={"origin": ORIGIN})
        self.c.__enter__()
        self.addCleanup(self.c.__exit__, None, None, None)

    def activate(self):
        r = self.c.post(
            "/api/activate",
            json={"username": "owner", "password": SECRET, "code": "T" * 40},
        )
        self.assertEqual(r.status_code, 200, r.text)
        return r

    def test_enrol_once(self):
        self.assertEqual(self.c.get("/api/workspace").status_code, 401)
        self.activate()
        self.assertTrue(self.c.get("/api/session").json()["owner"])
        self.assertEqual(
            self.c.post(
                "/api/activate",
                json={"username": "second", "password": SECRET, "code": "T" * 40},
            ).status_code,
            409,
        )

    def test_draft_retry_and_restore_conflict(self):
        self.activate()
        change = {
            "kind": "task",
            "id": "draft",
            "version": 0,
            "data": {"title": "one", "due": "2026-11-07"},
        }
        for _ in range(2):
            self.assertEqual(
                self.c.post(
                    "/api/offline/sync", json={"changes": [change]}
                ).status_code,
                200,
            )
        records = self.c.get("/api/workspace").json()["records"]
        self.assertEqual(len(records), 1)
        self.assertEqual(
            self.c.post("/api/restore", json={"format": 1, "records": records}).json()[
                "saved"
            ],
            0,
        )
        change["data"]["title"] = "conflict"
        self.assertEqual(
            self.c.post("/api/offline/sync", json={"changes": [change]}).status_code,
            409,
        )

    def test_attachment_and_catalog_scoping(self):
        self.activate()
        self.c.post(
            "/api/offline/sync",
            json={
                "changes": [
                    {
                        "kind": "task",
                        "id": "draft",
                        "version": 0,
                        "data": {"title": "x", "due": "2026-11-07"},
                    }
                ]
            },
        )
        r = self.c.post(
            "/api/files/add",
            json={"task": "draft", "name": "note.md", "content": "b2s="},
        )
        self.assertEqual(r.status_code, 200, r.text)
        url = "/api/files/" + r.json()["id"]
        self.assertEqual(self.c.get(url).content, b"ok")
        r = self.c.post(
            "/api/catalog",
            json={
                "id": "custom",
                "short": "Тест",
                "full": "Тестовый предмет",
                "version": 0,
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.c.post("/api/logout", json={})
        self.assertEqual(self.c.get(url).status_code, 401)
        self.assertTrue(
            any(x["id"] == "custom" for x in self.c.get("/api/catalog").json())
        )
