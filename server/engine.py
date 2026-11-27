"""Deterministic calculations. Inputs are dated facts, never language-model output."""

from collections import Counter, defaultdict
from datetime import date, timedelta
from math import ceil
from .calendar import minute
from .models import Travel, Strategy

VERSION = "chronos-1"
PRESETS = {
    k: Strategy(title=k, time_weight=t, risk_weight=r, recovery_weight=c).model_dump()
    for k, t, r, c in [
        ("Balance", 3, 3, 3),
        ("Freedom", 5, 2, 2),
        ("Session", 2, 5, 5),
        ("Recovery", 4, 3, 4),
        ("Conservative", 1, 5, 5),
    ]
}


def group(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["kind"]].append(dict(row["data"], _id=row["id"]))
    return groups


def budget(attended, total, remaining, target, reserve):
    pct = round(100 * attended / total, 1) if total else None
    if remaining is None:
        return dict(percent=pct, required=None, reserve=None, attainable=None)
    needed = max(0, ceil((total + remaining) * target / 100) - attended)
    return dict(
        percent=pct,
        required=needed,
        reserve=max(0, remaining - needed - reserve),
        attainable=needed <= remaining,
    )


def academic(g, subject, until, strategy):
    profile = next((s for s in g["subject"] if s["subject"] == subject), {})
    logs = sorted(
        (
            a
            for a in g["attendance"]
            if a["subject"] == subject and a["date"] < str(until)
        ),
        key=lambda a: (a["date"], a["start"]),
    )
    counted = [a for a in logs if a["status"] != "excused"]
    by_minute = profile.get("unit") == "minute"

    def weight(a):
        return minute(a["end"]) - minute(a["start"]) if by_minute else 1

    total = sum(map(weight, counted))
    attended = sum(weight(a) for a in counted if a["status"] in {"present", "late"})
    streak = 0
    for a in reversed(logs):
        if a["status"] != "absent":
            break
        streak += 1
    target = profile.get("target", strategy["target"])
    reserve = profile.get("reserve", strategy["reserve"])
    recent = [a for a in counted if a["date"] >= str(until - timedelta(days=28))]
    recent_total = sum(map(weight, recent))
    recent_attended = sum(
        weight(a) for a in recent if a["status"] in {"present", "late"}
    )
    remaining = profile.get("remaining")
    projected = (
        round(100 * (attended + remaining) / (total + remaining), 1)
        if remaining is not None and total + remaining
        else None
    )
    return dict(
        projected_full=projected,
        recent=round(100 * recent_attended / recent_total, 1) if recent_total else None,
        subject=subject,
        attended=attended,
        total=total,
        remaining=profile.get("remaining"),
        unit="мин" if by_minute else "урок",
        target=target,
        safety=reserve,
        late=sum(a["status"] == "late" for a in logs),
        streak=streak,
        profile=profile,
        **budget(attended, total, profile.get("remaining"), target, reserve),
    )


def travel_config(g):
    return (g["travel"] or [Travel().model_dump()])[0]


def services(g, day, direction):
    rows = []
    for t in g["trip"]:
        if t["date"] != str(day) or t["direction"] != direction or t["cancelled"]:
            continue
        departure = minute(t["departure"]) + t["delay"]
        arrival = minute(t["arrival"]) + t["delay"] + (1440 if t["overnight"] else 0)
        rows.append(dict(t, dep=departure, arr=arrival))
    return sorted(rows, key=lambda t: (t["dep"], t["arr"]))


def train_after(g, day, release):
    p = travel_config(g)
    access = p["metro"] + p["walk"]
    for t in services(g, day, "out"):
        slack = t["dep"] - release - access
        if slack >= p["boarding"]:
            return dict(
                number=t["number"],
                dep=t["dep"],
                arr=t["arr"],
                leave=t["dep"] - access - p["cushion"],
                latest=t["dep"] - access - p["boarding"],
                wait=slack,
                tight=slack < p["cushion"],
                home=None if p["last_mile"] is None else t["arr"] + p["last_mile"],
            )
    return None


def train_before(g, day, first):
    p = travel_config(g)
    access = p["metro"] + p["walk"]
    fits = [t for t in services(g, day, "in") if t["arr"] + access <= first]
    if not fits:
        return None
    t = max(fits, key=lambda t: t["dep"])
    return dict(
        number=t["number"],
        dep=t["dep"],
        arr=t["arr"],
        college=t["arr"] + access,
        leave=(
            None if p["last_mile"] is None else t["dep"] - p["cushion"] - p["last_mile"]
        ),
    )


def strategy_for(g, name):
    return next(
        (s for s in g["strategy"] if s["_id"] == name),
        PRESETS.get(name, PRESETS["Balance"]),
    )


def recovery(g, day):
    tasks = {t["_id"]: t for t in g["task"]}

    def key(t):
        return (t["due"] >= str(day), t["due"], -t["priority"], t["minutes"])

    ordered = sorted((t for t in tasks.values() if not t["done"]), key=key)
    return [
        dict(
            t,
            blocked=bool(t["depends"] and not tasks.get(t["depends"], {}).get("done")),
        )
        for t in ordered
    ]


def simulate(g, day, lessons, skips, strategy):
    selected = {l["start"] for l in lessons}
    if not set(skips) <= selected:
        raise ValueError("Выбранное занятие отменено или отсутствует в расписании")
    gone = [l for l in lessons if l["start"] in skips]
    stay = [l for l in lessons if l["start"] not in skips]
    reasons = []
    blocked = []
    uncertainty = []
    impacts = []
    cost = 0
    risk = 0
    academic_cost = 0
    for subject in sorted({l["subject"] for l in gone}):
        stat = academic(g, subject, day, strategy)
        upcoming = [l for l in lessons if l["subject"] == subject]
        missed = [l for l in gone if l["subject"] == subject]

        def units(ls):
            return (
                sum(minute(l["end"]) - minute(l["start"]) for l in ls)
                if stat["unit"] == "мин"
                else len(ls)
            )

        total = stat["total"] + units(upcoming)
        attend = stat["attended"] + units(upcoming) - units(missed)
        target = stat["target"]
        pct = 100 * attend / total
        impacts.append(
            dict(
                subject=subject,
                before=stat["percent"],
                after=round(pct, 1),
                total=stat["total"],
            )
        )
        if attend * 100 < target * total:
            blocked.append(f"{subject} · после сценария {pct:.1f}% при цели {target}%")
        if stat["reserve"] is not None and units(missed) > stat["reserve"]:
            blocked.append(f"{subject} · затронут неприкосновенный резерв")
        if not stat["total"]:
            uncertainty.append(f"{subject} · журнал пока пуст")
        if stat["streak"]:
            reasons.append(
                f"{subject} · подряд пропущено уроков в журнале: {stat['streak']}"
            )
            risk += min(15, 3 * stat["streak"])
        profile = stat["profile"]
        if profile.get("required") and strategy["protect_required"]:
            blocked.append(f"{subject} · обязательное присутствие")
        debt = sum(
            t["category"] == "debt" and not t["done"] and t["subject"] == subject
            for t in g["task"]
        )
        if debt and strategy["protect_debts"]:
            blocked.append(f"{subject} · открытых долгов: {debt}")
        teacher = profile.get("teacher")
        if teacher:
            teacher_profile = next(
                (
                    t
                    for t in g["teacher"]
                    if t["teacher"].casefold() == teacher.casefold()
                ),
                None,
            )
            if teacher_profile and teacher_profile["control"] >= 4:
                reasons.append(f"{teacher} · в личном профиле отмечен строгий контроль")
                risk += teacher_profile["control"]
            teacher_days = {
                a["date"]
                for a in g["attendance"]
                if a["teacher"] == teacher
                and a["status"] == "absent"
                and str(day - timedelta(days=28)) <= a["date"] < str(day)
            }
            observations = [
                o
                for o in g["observation"]
                if o["teacher"] == teacher and o["date"] < str(day)
            ]
            if teacher_days:
                reasons.append(
                    f"{teacher} · дней с пропуском за 4 недели: {len(teacher_days)}"
                )
            if observations:
                count = sum(o["outcome"] in {"makeup", "debt"} for o in observations)
                reasons.append(
                    f"{teacher} · отработка или долг в {count} из {len(observations)} записанных наблюдений"
                )
                risk += round(8 * count / len(observations))
        grades = grade_summary(g, subject)
        if grades["mean"] is not None and grades["mean"] < grades["target"]:
            academic_cost += (
                strategy["grade_weight"]
                * (grades["target"] - grades["mean"])
                * len(missed)
            )
            reasons.append(
                f"{subject} · средняя оценка {grades['mean']} при цели {grades['target']}"
            )
        if (
            stat["recent"] is not None
            and stat["percent"] is not None
            and stat["recent"] < stat["percent"]
        ):
            academic_cost += strategy["attendance_weight"] * len(missed)
            reasons.append(
                f"{subject} · за 4 недели {stat['recent']}% при общей посещаемости {stat['percent']}%"
            )
        deadlines = [
            t
            for t in g["task"]
            if not t["done"]
            and t["subject"] == subject
            and str(day) <= t["due"] <= str(day + timedelta(days=3))
        ]
        if deadlines:
            reasons.append(f"{subject} · ближайших сроков: {len(deadlines)}")
            academic_cost += len(deadlines) * strategy["debt_weight"]
        predicted = profile.get("makeup", 30)
        cost += predicted * len(missed)
        risk += len(missed) * profile.get("importance", 3)
    if any(c["date"] == str(day) and c["start"] in skips for c in g["critical"]):
        blocked.append("На выбранное время отмечена обязательная работа")
    same_days = {
        a["date"]
        for a in g["attendance"]
        if a["status"] == "absent"
        and str(day - timedelta(days=28)) <= a["date"] < str(day)
        and date.fromisoformat(a["date"]).weekday() == day.weekday()
    }
    if gone and len(same_days) >= 2:
        reasons.append(f"Пропуски в этот день недели за месяц: {len(same_days)}")
        risk += len(same_days) * 2
    base_end = minute(lessons[-1]["end"]) if lessons else None
    end = minute(stay[-1]["end"]) if stay else None
    base_train = train_after(g, day, base_end) if base_end is not None else None
    train = train_after(g, day, end) if end is not None else None
    first = minute(stay[0]["start"]) if stay else None
    inbound = train_before(g, day, first) if first is not None else None
    base_in = train_before(g, day, minute(lessons[0]["start"])) if lessons else None
    minutes = sum(minute(l["end"]) - minute(l["start"]) for l in gone)
    saved = None
    if not gone:
        saved = 0
    elif stay and train and base_train:
        later = first != minute(lessons[0]["start"])
        if not later or base_in and inbound:
            saved = (base_train["arr"] - train["arr"]) + (
                inbound["dep"] - base_in["dep"] if later else 0
            )
    elif (
        not stay
        and base_train
        and base_in
        and base_in["leave"] is not None
        and base_train["home"] is not None
    ):
        saved = base_train["home"] - base_in["leave"]
    if gone and saved is None:
        uncertainty.append(
            "Для расчёта времени дома нужны рейсы на эту дату и параметры маршрута"
        )
    net = saved - cost if saved is not None else None
    wait_gain = base_train["wait"] - train["wait"] if base_train and train else 0
    travel_gain = 0
    if not stay and base_train and base_in:
        p = travel_config(g)
        travel_gain = (
            base_train["arr"]
            - base_train["dep"]
            + base_in["arr"]
            - base_in["dep"]
            + 2 * (p["walk"] + p["metro"])
        )
    pulse = next((p for p in g["pulse"] if p["date"] == str(day)), None)
    rest = 0
    if pulse and gone and (pulse["sleep"] < 6 or pulse["fatigue"] >= 4):
        rest = min(90, minutes) * (strategy["rest_weight"] - 1) / 6
        reasons.append("В дневнике отмечены короткий сон или высокая усталость")
    history = [
        d["actual"] - d["estimate"]
        for d in g["decision"]
        if d["date"] < str(day)
        and d.get("actual") is not None
        and d.get("estimate") is not None
    ]
    correction = (
        max(-30, min(30, sum(history) / len(history)))
        if gone and net is not None and len(history) >= 3
        else 0
    )
    if correction:
        reasons.append(
            f"По {len(history)} сравнениям плана с фактом поправка к оценке: {correction:+.0f} мин"
        )
    score = (
        (net or 0) * strategy["time_weight"]
        - risk * strategy["risk_weight"]
        - cost * (strategy["recovery_weight"] - 1)
    )
    score += (
        correction
        + rest
        - academic_cost
        + wait_gain * (strategy["waiting_weight"] - 3)
        + travel_gain * (strategy["travel_weight"] - 3)
    )
    if train and train["tight"]:
        score -= strategy["comfort_weight"] * 2
    score -= cost * (5 - strategy["self_weight"]) / 6
    return dict(
        algorithm=VERSION,
        skip=sorted(skips),
        end=end,
        first=first,
        train=train,
        inbound=inbound,
        minutes=minutes,
        away_saved=saved,
        makeup=cost,
        net=net,
        blocked=blocked,
        reasons=reasons,
        unknown=uncertainty,
        risk_points=risk,
        impacts=impacts,
        score=round(score, 2),
    )


def optimize(g, day, ls, strategy):
    starts = [l["start"] for l in ls]
    # Include every isolated absence plus every contiguous attendance window (late arrival / early departure).
    candidates = {(), tuple(starts)}
    candidates.update((s,) for s in starts)
    for left in range(len(starts)):
        for right in range(left + 1, len(starts) + 1):
            candidates.add(tuple(starts[:left] + starts[right:]))
    results = [
        simulate(g, day, ls, s, strategy)
        for s in sorted(candidates, key=lambda s: (len(s), s))
    ]
    return sorted(
        results, key=lambda s: (bool(s["blocked"]), -s["score"], len(s["skip"]))
    )


def time_report(g, start, end):
    amounts = Counter()
    for e in g["ledger"]:
        if str(start) <= e["date"] <= str(end):
            amounts[e["category"]] += minute(e["end"]) - minute(e["start"])
    decisions = [d for d in g["decision"] if str(start) <= d["date"] <= str(end)]
    return dict(
        categories=amounts,
        total=sum(amounts.values()),
        estimated=sum(d["estimate"] for d in decisions if d["estimate"] is not None),
        actual=sum(d["actual"] for d in decisions if d["actual"] is not None),
        measured=sum(d["actual"] is not None for d in decisions),
    )


def optimize_period(db, g, start, days, strategy):
    """Re-evaluate each following day against the chosen earlier days; no writes to storage."""
    from copy import deepcopy
    from .calendar import lessons, day_range

    virtual = deepcopy(g)
    result = []
    for day in day_range(start, days):
        ls = lessons(db, day)
        choices = optimize(virtual, day, ls, strategy)
        plan = choices[0]
        result.append(
            dict(
                date=str(day),
                skip=plan["skip"],
                net=plan["net"],
                minutes=plan["minutes"],
                constraints=plan["blocked"],
                unknown=plan["unknown"],
            )
        )
        known = {(a["date"], a["start"]) for a in virtual["attendance"]}
        for l in ls:
            if (str(day), l["start"]) in known:
                continue
            profile = next(
                (p for p in virtual["subject"] if p["subject"] == l["subject"]), {}
            )
            virtual["attendance"].append(
                dict(
                    l,
                    status="absent" if l["start"] in plan["skip"] else "present",
                    teacher=profile.get("teacher", ""),
                )
            )
            if profile.get("remaining") is not None:
                delta = (
                    minute(l["end"]) - minute(l["start"])
                    if profile["unit"] == "minute"
                    else 1
                )
                profile["remaining"] = max(0, profile["remaining"] - delta)
    return dict(
        method="Последовательный пересчёт по дням",
        algorithm=VERSION,
        days=result,
        net=sum(r["net"] for r in result if r["net"] is not None),
        estimated_days=sum(r["net"] is not None for r in result),
    )


def grade_summary(g, subject):
    grades = sorted(
        [v for v in g["grade"] if v["subject"] == subject], key=lambda v: v["date"]
    )
    goal = next((s["goal_grade"] for s in g["subject"] if s["subject"] == subject), 4)
    avg = sum(v["grade"] for v in grades) / len(grades) if grades else None
    need = max(0, goal * len(grades) - sum(v["grade"] for v in grades))
    return dict(
        count=len(grades),
        mean=round(avg, 2) if avg is not None else None,
        target=goal,
        fives=0 if not need else ceil(need / (5 - goal)) if goal < 5 else None,
        grades=grades,
    )
