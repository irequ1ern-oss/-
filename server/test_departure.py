import unittest
from datetime import date, timedelta
from .departure import connections, last_pair_options
from .engine import group, PRESETS
from .test_system import trip, DAY


class DepartureComparisonTests(unittest.TestCase):
    def setUp(self):
        self.day = date.fromisoformat(DAY)
        self.g = group([])
        self.g["trip"] = [trip("A", "16:40", "18:09"), trip("B", "18:10", "19:41")]
        self.lessons = [
            dict(subject="ig", start="13:55", end="14:40"),
            dict(subject="ig", start="14:50", end="15:35"),
            dict(subject="lang", start="15:45", end="16:30"),
        ]

    def test_compare_last_lesson_and_mixed_pair(self):
        self.g["observation"] = [
            dict(
                subject="lang", date=str(self.day - timedelta(days=3)), outcome="makeup"
            ),
            dict(
                subject="lang", date=str(self.day + timedelta(days=2)), outcome="debt"
            ),
        ]
        self.g["critical"] = [dict(date=DAY, start="15:45")]
        result = last_pair_options(self.g, self.day, self.lessons, PRESETS["Balance"])
        one, pair = result["alternatives"]
        self.assertEqual(result["full"]["train"]["number"], "B")
        self.assertEqual(
            (one["plan"]["train"]["number"], one["plan"]["net"]), ("A", 62)
        )
        self.assertEqual(pair["starts"], ["14:50", "15:45"])
        self.assertEqual([s["subject"] for s in pair["samples"]], ["ig", "lang"])
        self.assertEqual(
            (one["samples"][0]["followups"], one["samples"][0]["observations"]), (1, 1)
        )
        self.assertTrue(one["plan"]["blocked"])
        self.assertFalse(self.g["attendance"])

    def test_exact_cutoff_morning_and_cancellations(self):
        self.g["trip"].append(dict(trip("C", "11:40", "13:00"), direction="in"))
        exact = connections(self.g, self.day, 15 * 60 + 45, self.lessons)
        self.assertEqual(
            (exact["cutoff"], exact["train"]["number"], exact["after_cutoff"]),
            (945, "A", 92),
        )
        self.assertEqual(exact["inbound"]["college"], 820)
        self.assertIsNone(exact["inbound"]["leave"])
        self.assertEqual(
            connections(self.g, self.day, 946, self.lessons)["train"]["number"], "B"
        )
        self.g["trip"][1]["cancelled"] = True
        self.assertIsNone(connections(self.g, self.day, 945, self.lessons)["fallback"])
        self.assertFalse(
            last_pair_options(self.g, self.day, [], PRESETS["Balance"])["alternatives"]
        )

    def test_unscheduled_pair_and_missing_transport(self):
        lessons = [dict(start="12:01", end="12:42", subject="lang")]
        result = last_pair_options(group([]), self.day, lessons, PRESETS["Balance"])
        self.assertEqual(len(result["alternatives"]), 1)
        self.assertIsNone(result["alternatives"][0]["plan"]["net"])
