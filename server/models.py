from datetime import date
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
]
Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)
]
Clock = Annotated[str, StringConstraints(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]
Minute = Annotated[int, Field(ge=0, le=1440)]
Percent = Annotated[int, Field(ge=0, le=100)]
Level = Annotated[int, Field(ge=1, le=5)]
Mark = Literal["present", "absent", "late", "excused"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Attendance(Model):
    date: date
    start: Clock
    subject: Title
    status: Mark
    end: Clock
    teacher: str = Field(default="", max_length=120)


class Subject(Model):
    subject: Title
    teacher: str = Field(default="", max_length=120)
    target: Percent = 80
    reserve: int = Field(default=1, ge=0, le=250)
    remaining: int | None = Field(default=None, ge=0, le=5000)
    unit: Literal["lesson", "minute"] = "lesson"
    required: bool = False
    mastery: Level = 3
    importance: Level = 3
    makeup: Minute = 30
    goal_grade: Level = 4


class Grade(Model):
    subject: Title
    date: date
    grade: Annotated[int, Field(ge=2, le=5)]
    title: Title


class Observation(Model):
    teacher: Title
    date: date
    subject: Title
    outcome: Literal["none", "remark", "makeup", "debt", "material", "other"]
    note: str = Field(default="", max_length=4000)


class Task(Model):
    title: Title
    subject: str = Field(default="", max_length=120)
    category: Literal[
        "homework", "practice", "exam", "course", "debt", "personal", "reminder"
    ] = "homework"
    due: date
    priority: Level = 3
    minutes: Minute = 30
    repeat_days: Annotated[int, Field(ge=0, le=365)] = 0
    spent: Minute = 0
    done: bool = False
    portable: bool = False
    depends: str = Field(default="", max_length=80)
    link: str = Field(default="", max_length=1500, pattern=r"^(?:$|https?://\S+)$")


class Travel(Model):
    station: Title = "Вокзал"
    destination: Title = "Станция назначения"
    metro: Minute = 28
    walk: Minute = 12
    cushion: Minute = 20
    boarding: Minute = 15
    last_mile: Minute | None = None

    @model_validator(mode="after")
    def check_buffer(self):
        if self.boarding > self.cushion:
            raise ValueError("Запас до отправления должен покрывать начало посадки")
        return self


class Trip(Model):
    date: date
    direction: Literal["out", "in"] = "out"
    number: Title
    departure: Clock
    arrival: Clock
    overnight: bool = False
    cancelled: bool = False
    delay: Minute = 0

    @model_validator(mode="after")
    def check_times(self):
        if (self.arrival <= self.departure) != self.overnight:
            raise ValueError("Уточни дату прибытия и переход через полночь")
        return self


class Ledger(Model):
    date: date
    start: Clock
    end: Clock
    category: Literal[
        "sleep",
        "class",
        "travel",
        "wait",
        "gap",
        "homework",
        "self",
        "makeup",
        "project",
        "rest",
        "free",
        "other",
    ]
    note: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def order(self):
        if self.start >= self.end:
            raise ValueError(
                "Конец должен быть позже начала. Ночную запись раздели в полночь."
            )
        return self


class Strategy(Model):
    title: Title
    target: Percent = 80
    reserve: int = Field(default=1, ge=0, le=50)
    time_weight: Level = 3
    risk_weight: Level = 3
    recovery_weight: Level = 3
    grade_weight: Level = 3
    attendance_weight: Level = 3
    travel_weight: Level = 3
    waiting_weight: Level = 3
    debt_weight: Level = 3
    comfort_weight: Level = 3
    rest_weight: Level = 3
    self_weight: Level = 3
    protect_required: bool = True
    protect_debts: bool = True


class Critical(Model):
    date: date
    start: Clock
    title: Title


class Memory(Model):
    title: Title
    category: Literal["fact", "personal", "observation", "strategy", "episode"]
    text: Text
    source: Title
    confidence: Percent = 100
    active: bool = True


class Note(Model):
    title: Title
    subject: str = Field(default="", max_length=120)
    text: str = Field(default="", max_length=32000)
    link: str = Field(
        default="", max_length=1500, pattern=r"^(?:$|(?:https?://|obsidian://)\S+)$"
    )


class Pulse(Model):
    date: date
    sleep: Annotated[float, Field(ge=0, le=24)]
    fatigue: Level
    note: str = Field(default="", max_length=500)


class Layout(Model):
    context: Literal["auto", "Dawn", "Execution", "Departure", "Nocturne"] = "auto"
    order: list[Literal["bells", "travel", "risks", "tasks", "plan", "tomorrow"]] = (
        Field(max_length=6)
    )
    wide: list[str] = Field(default_factory=list, max_length=6)
    hidden: list[str] = Field(default_factory=list, max_length=6)
    strategy: str = Field(default="Balance", max_length=80)


class Decision(Model):
    date: date
    starts: list[Clock] = Field(max_length=24)
    algorithm: str = Field(max_length=32)
    estimate: int | None = None
    actual: int | None = Field(default=None, ge=-1440, le=1440)
    note: str = Field(default="", max_length=1000)


class ChatSettings(Model):
    provider: Literal["openai", "gemini", "openrouter"] = "openai"
    model: Title
    style: Literal["Shay", "Analyst"] = "Shay"
    prompt: str = Field(default="", max_length=2000)


MODELS = dict(
    attendance=Attendance,
    subject=Subject,
    grade=Grade,
    observation=Observation,
    task=Task,
    travel=Travel,
    trip=Trip,
    ledger=Ledger,
    strategy=Strategy,
    critical=Critical,
    memory=Memory,
    note=Note,
    pulse=Pulse,
    layout=Layout,
    decision=Decision,
    chat_settings=ChatSettings,
)


class Rule(Model):
    title: Title
    when: Literal["morning", "departure", "deadline", "evening"]
    at: Clock = "05:40"
    lead: Annotated[int, Field(ge=0, le=180)] = 15
    enabled: bool = True
    quiet_start: Clock = "22:00"
    quiet_end: Clock = "05:30"
    weekdays_only: bool = True
    require_lessons: bool = False
    require_debts: bool = False
    condition_mode: Literal["AND", "OR"] = "AND"


MODELS["rule"] = Rule


class Teacher(Model):
    teacher: Title
    control: Level = 3
    demand: Level = 3
    makeup_difficulty: Level = 3
    independent: bool = True
    tests: str = Field(default="", max_length=300)
    note: str = Field(default="", max_length=4000)


MODELS["teacher"] = Teacher


class PulseFlags(Model):
    workload_lab: bool = False
    compact: bool = False
    reduced_motion: bool = False


MODELS["workshop"] = PulseFlags


class Term(Model):
    title: Title
    start: date
    end: date

    @model_validator(mode="after")
    def order(self):
        span = (self.end - self.start).days
        if not 0 <= span <= 366:
            raise ValueError("Семестр длится до одного года")
        return self


MODELS["term"] = Term
