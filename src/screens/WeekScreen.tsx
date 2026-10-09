import { useMemo, useRef, useState } from 'preact/hooks';
import { dayHasChanges, type ResolvedDay, type ResolvedLesson, type ScheduleSources } from '../core/schedule';
import { weekDays } from '../core/week';
import { formatDDMM, formatWeekRange, weekdayShort } from '../core/format';
import { addDays, diffDays, startOfWeek, type Clock } from '../core/time';
import { getSubject } from '../data/schedule';
import { IconChevronLeft, IconChevronRight } from '../components/Icons';

interface Props {
  clock: Clock;
  src: ScheduleSources;
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'эта неделя';
  if (offset === 1) return 'следующая неделя';
  if (offset === -1) return 'прошлая неделя';
  return offset > 0 ? `через ${offset} нед.` : `${-offset} нед. назад`;
}

export function WeekScreen({ clock, src }: Props) {
  const thisMonday = startOfWeek(clock.date);
  const [monday, setMonday] = useState(thisMonday);
  const days = useMemo(() => weekDays(monday, src), [monday, src]);
  const offset = Math.round(diffDays(thisMonday, monday) / 7);

  const shift = (weeks: number) => setMonday(addDays(monday, weeks * 7));

  // Свайп влево/вправо — соседняя неделя.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
  };

  return (
    <section class="screen" aria-labelledby="week-title" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header class="week-nav">
        <button class="icon-button" onClick={() => shift(-1)} aria-label="Предыдущая неделя">
          <IconChevronLeft />
        </button>
        <div class="week-nav__label">
          <h1 id="week-title">{formatWeekRange(monday)}</h1>
          <p class="muted">{weekLabel(offset)}</p>
        </div>
        <button class="icon-button" onClick={() => shift(1)} aria-label="Следующая неделя">
          <IconChevronRight />
        </button>
      </header>
      {offset !== 0 && (
        <button class="link-button week-nav__today" onClick={() => setMonday(thisMonday)}>
          К текущей неделе
        </button>
      )}

      <div class="week-grid">
        {days.map((day) => (
          <DayBlock key={day.date} day={day} isToday={day.date === clock.date} isPast={day.date < clock.date} />
        ))}
      </div>
    </section>
  );
}

function DayBlock({ day, isToday, isPast }: { day: ResolvedDay; isToday: boolean; isPast: boolean }) {
  const changed = dayHasChanges(day);
  return (
    <article class={`day${isToday ? ' day--today' : ''}${isPast ? ' day--past' : ''}`}>
      <header class="day__head">
        <h2>
          {weekdayShort(day.date)} <span class="muted">{formatDDMM(day.date)}</span>
        </h2>
        {isToday && <span class="chip chip--today">сегодня</span>}
        {changed && (
          <span class="chip chip--changed" title={day.period ? `Временное расписание: ${day.period.title}` : 'Есть изменения'}>
            ⚠ {day.period ? day.period.title : 'изменения'}
          </span>
        )}
      </header>
      {day.lessons.length === 0 ? (
        <p class="day__empty muted">Пар нет</p>
      ) : (
        <ul class="day__lessons">
          {day.lessons.map((l, i) => (
            <WeekLesson key={`${l.start}-${i}`} lesson={l} />
          ))}
        </ul>
      )}
    </article>
  );
}

function WeekLesson({ lesson }: { lesson: ResolvedLesson }) {
  const [open, setOpen] = useState(false);
  const subject = getSubject(lesson.subjectId);
  return (
    <li class={`row row--${lesson.status}`}>
      <button class="row__main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class="row__time">
          {lesson.start}–{lesson.end}
        </span>
        <span class="row__subject">{subject.short}</span>
        <span class="row__room">{lesson.room ?? ''}</span>
      </button>
      {open && (
        <div class="row__details">
          {subject.full}
          {lesson.note && <div class="muted">{lesson.note}</div>}
          {lesson.status === 'cancelled' && <div>Пара отменена</div>}
        </div>
      )}
    </li>
  );
}
