import { Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { activeLessons, type ScheduleSources } from '../core/schedule';
import { computeTodayView, lessonPhase, type TodayView } from '../core/today';
import { capitalize, formatDayLong, formatDayMonth, formatDuration, plural, relativeDayName, weekdayName } from '../core/format';
import { toMinutes, type Clock } from '../core/time';
import { getSubject } from '../data/schedule';
import { BreakRow, LessonCard } from '../components/LessonCard';

interface Props {
  clock: Clock;
  src: ScheduleSources;
}

const REASON: Record<NonNullable<TodayView['reason']>, string> = {
  finished: 'На сегодня пары закончились',
  cancelled: 'Сегодня все пары отменены',
  free: 'Сегодня пар нет',
};

function statusLine(view: TodayView): string | null {
  if (!view.isToday) return null;
  if (view.current) {
    const s = getSubject(view.current.lesson.subjectId).short;
    return `Идёт ${s} · до конца ${formatDuration(view.current.minutesLeft)}`;
  }
  if (view.next) {
    const s = getSubject(view.next.lesson.subjectId).short;
    const prefix = view.inBreak ? 'Перемена' : `Первая пара в ${view.next.lesson.start}`;
    return `${prefix} · ${s} через ${formatDuration(view.next.minutesUntil)}`;
  }
  return null;
}

export function TodayScreen({ clock, src }: Props) {
  const view = useMemo(() => computeTodayView(clock, src), [clock, src]);
  const { day } = view;

  let title: string;
  let subtitle: string;
  if (view.isToday) {
    title = 'Сегодня';
    subtitle = formatDayLong(day.date);
  } else {
    const rel = relativeDayName(day.date, clock.date);
    title = rel ?? capitalize(weekdayName(day.date));
    subtitle = rel ? formatDayLong(day.date) : formatDayMonth(day.date);
  }

  const active = activeLessons(day);
  const line = statusLine(view);

  return (
    <section class="screen" aria-labelledby="today-title">
      {!view.isToday && view.reason && (
        <p class="notice">
          {REASON[view.reason]}
          {view.daysAhead > 3 &&
            ` · ближайшие пары через ${view.daysAhead} ${plural(view.daysAhead, 'день', 'дня', 'дней')}`}
        </p>
      )}
      <header class="day-heading">
        <h1 id="today-title">{title}</h1>
        <p class="muted">{subtitle}</p>
        {line && <p class="status-line">{line}</p>}
      </header>

      {view.nothingAhead ? (
        <p class="empty">Пар не найдено на ближайшие месяцы.</p>
      ) : (
        <ol class="lessons">
          {day.lessons.map((lesson, i) => {
            const prev = i > 0 ? day.lessons[i - 1] : undefined;
            const showBreak = prev && prev.status !== 'cancelled' && lesson.status !== 'cancelled';
            const gap = prev ? toMinutes(lesson.start) - toMinutes(prev.end) : 0;
            const breakActive =
              view.isToday && view.inBreak && view.next?.lesson === lesson && active.includes(lesson);
            return (
              <Fragment key={`${lesson.start}-${i}`}>
                {showBreak && (
                  <BreakRow
                    minutes={gap}
                    active={breakActive}
                    minutesUntil={breakActive ? view.next?.minutesUntil : undefined}
                  />
                )}
                <LessonCard
                  lesson={lesson}
                  phase={view.isToday ? lessonPhase(lesson, clock) : 'upcoming'}
                  current={view.current?.lesson === lesson ? view.current : undefined}
                  minutesUntil={view.next?.lesson === lesson ? view.next.minutesUntil : undefined}
                />
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
