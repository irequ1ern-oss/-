import json
import os
from contextlib import asynccontextmanager
from unittest import TestCase
from unittest.mock import patch
import httpx
from .test_system import ORIGIN, SECRET
from .main import app
from .db import transaction
import tempfile
from fastapi.testclient import TestClient


def fixture_stream(rounds):
    @asynccontextmanager
    async def stream(client, method, url, **kw):
        frames = rounds.pop(0)
        response = httpx.Response(
            200,
            request=httpx.Request(method, url),
            content="".join(
                "data: " + json.dumps(f, ensure_ascii=False) + "\n\n" for f in frames
            )
            + "data: [DONE]\n\n",
        )
        yield response

    return stream


def chunk(delta, reason=None):
    return {"choices": [{"index": 0, "delta": delta, "finish_reason": reason}]}


class StreamTest(TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        env = patch.dict(
            os.environ,
            dict(
                REQUIEM_ORIGIN=ORIGIN,
                ALL_PROXY="",
                HTTPS_PROXY="",
                HTTP_PROXY="",
                all_proxy="",
                https_proxy="",
                http_proxy="",
                REQUIEM_DB=tmp.name + "/db",
                SHAY_PROVIDER="openai",
                SHAY_OPENAI_KEY="fixture",
                SHAY_OPENAI_MODELS="fixture",
                REQUIEM_ACTIVATION_CODE="A" * 40,
            ),
        )
        env.start()
        self.addCleanup(env.stop)
        self.c = TestClient(app, base_url=ORIGIN, headers={"origin": ORIGIN})
        self.c.__enter__()
        self.addCleanup(self.c.__exit__, None, None, None)
        self.assertEqual(
            self.c.post(
                "/api/activate",
                json=dict(username="tester", password=SECRET, code="A" * 40),
            ).status_code,
            200,
        )

    def test_stream_tool_fragments_usage_and_stored_answer(self):
        usage = {"choices": [], "usage": {"total_tokens": 37}}
        rounds = [
            [
                chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "ref",
                                "function": {"name": "get_current", "arguments": "{"},
                            }
                        ]
                    }
                ),
                chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "function": {"name": "_context", "arguments": "}"},
                            }
                        ]
                    },
                    "tool_calls",
                ),
                usage,
            ],
            [chunk({"content": "До "}), chunk({"content": "перемены."}, "stop"), usage],
        ]
        with patch("httpx.AsyncClient.stream", fixture_stream(rounds)):
            result = self.c.post(
                "/api/ai/ask",
                json={
                    "text": "Сколько осталось?",
                    "stream": True,
                    "include_history": False,
                },
            )
        self.assertEqual(result.status_code, 200)
        events = [json.loads(line) for line in result.text.splitlines()]
        self.assertEqual(
            [e["type"] for e in events], ["tool", "delta", "delta", "complete"]
        )
        self.assertEqual(events[0]["name"], "get_current_context")
        self.assertEqual(events[-1]["answer"], "До перемены.")
        self.assertEqual(
            self.c.get("/api/ai/history").json()[0]["answer"], "До перемены."
        )
        with transaction() as db:
            self.assertEqual(
                db.execute("SELECT tokens FROM ai_usage").fetchone()[0], 74
            )

    def test_interrupted_stream_keeps_history_clean(self):
        with patch(
            "httpx.AsyncClient.stream", fixture_stream([[chunk({"content": "Обрыв"})]])
        ):
            result = self.c.post("/api/ai/ask", json={"text": "ответ", "stream": True})
        self.assertEqual(json.loads(result.text.splitlines()[-1])["type"], "error")
        self.assertEqual(self.c.get("/api/ai/history").json(), [])
