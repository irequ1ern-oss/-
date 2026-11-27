"""Compare the last lesson and bell-defined pair using the same Chronos projection."""

from .calendar import BELLS, minute
from .engine import academic, simulate, train_after, train_before


def last_pair_options(g, day, lessons, strategy):
    full = simulate(g, day, lessons, [], strategy)
    choices = []
    if lessons:
        last = lessons[-1]
        choices.append(("lesson", [last]))
        pair = next(
            (
                b
                for b in BELLS
                if b["start"] <= last["start"] and last["end"] <= b["end"]
            ),
            None,
        )
        if pair:
            block = [
                lesson
                for lesson in lessons
                if pair["start"] <= lesson["start"] and lesson["end"] <= pair["end"]
            ]
            if len(block) > 1:
                choices.append(("pair", block))

    alternatives = []
    for key, block in choices:
        starts = [lesson["start"] for lesson in block]
        plan = simulate(g, day, lessons, starts, strategy)
        samples = []
        for subject in sorted({lesson["subject"] for lesson in block}):
            stat = academic(g, subject, day, strategy)
            notes = [
                o
                for o in g["observation"]
                if o["subject"] == subject and o["date"] < str(day)
            ]
            samples.append(
                dict(
                    subject=subject,
                    attended=stat["attended"],
                    total=stat["total"],
                    unit=stat["unit"],
                    target=stat["target"],
                    remaining=stat["remaining"],
                    reserve=stat["reserve"],
                    followups=sum(o["outcome"] in {"makeup", "debt"} for o in notes),
                    observations=len(notes),
                )
            )
        alternatives.append(dict(kind=key, starts=starts, plan=plan, samples=samples))
    return dict(full=full, alternatives=alternatives)


def connections(g, day, release, lessons):
    first = train_after(g, day, release)
    later = train_after(g, day, release + 10)
    fallback = train_after(g, day, first["latest"] + 1) if first else None
    inbound = train_before(g, day, minute(lessons[0]["start"])) if lessons else None
    return dict(
        train=first,
        later=later,
        delta=later["arr"] - first["arr"] if first and later else None,
        cutoff=first["latest"] if first else None,
        fallback=fallback,
        after_cutoff=fallback["arr"] - first["arr"] if fallback else None,
        inbound=inbound,
    )
