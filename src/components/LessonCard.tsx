import { useState } from 'preact/hooks';
import { lessonRoom, type ResolvedLesson } from '../core/schedule';
import { formatRoom } from '../core/format';
import type { LessonPhase } from '../core/today';
import { formatDuration } from '../core/format';
import { getSubject } from '../data/schedule';

interface Props {
  lesson: ResolvedLesson;
  phase: LessonPhase;
  /** Для текущей пары: сколько осталось и доля прошедшего времени. */
  current?: { minutesLeft: number; progress: number };
  /** Для следующей пары: через сколько начнётся. */
  minutesUntil?: number;
}

const STATUS_LABEL: Record<ResolvedLesson['status'], string | null> = {
  normal: null,
  cancelled: 'отменена',
  changed: 'замена',
  added: 'добавлена',
};

export function LessonCard({ lesson, phase, current, minutesUntil }: Props) {
  const [open, setOpen] = useState(false);
  const subject = getSubject(lesson.subjectId);
  const status = STATUS_LABEL[lesson.status];
  const original = lesson.original && getSubject(lesson.original.subjectId);

  const classes = ['lesson', `lesson--${phase}`, `lesson--${lesson.status}`];
  if (minutesUntil !== undefined) classes.push('lesson--next');

  return (
    <li class={classes.join(' ')}>
      <button class="lesson__main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class="lesson__time">
          <span>{lesson.start}</span>
          <span class="lesson__end">{lesson.end}</span>
        </span>
        <span class="lesson__body">
          <span class="lesson__title">
            <span class="lesson__subject">{subject.short}</span>
            {status && <span class={`chip chip--${lesson.status}`}>{status}</span>}
          </span>
          <span class="lesson__meta">
            {formatRoom(lessonRoom(lesson, 1)) || 'кабинет не указан'}
            {current && <strong class="lesson__countdown"> · до конца {formatDuration(current.minutesLeft)}</strong>}
            {minutesUntil !== undefined && (
              <strong class="lesson__countdown"> · через {formatDuration(minutesUntil)}</strong>
            )}
          </span>
        </span>
      </button>
      {current && (
        <div class="progress" role="progressbar" aria-valuenow={Math.round(current.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div class="progress__bar" style={{ width: `${Math.min(100, current.progress * 100)}%` }} />
        </div>
      )}
      {open && (
        <div class="lesson__details">
          <div class="lesson__full">{subject.full}</div>
          {lesson.note && <div>{lesson.note}</div>}
          {original && lesson.original && (
            <div>
              Было: {original.short}
              {lessonRoom(lesson.original, 1) ? `, ${formatRoom(lessonRoom(lesson.original, 1))}` : ''}, {lesson.original.start}–{lesson.original.end}
            </div>
          )}
          {lesson.changeNote && <div>Комментарий: {lesson.changeNote}</div>}
          {lesson.source === 'period' && <div>По временному расписанию</div>}
        </div>
      )}
    </li>
  );
}

/** Строка между парами: «перемена 10 мин». Во время перемены подсвечивается. */
export function BreakRow({ minutes, active, minutesUntil }: { minutes: number; active: boolean; minutesUntil?: number }) {
  if (minutes <= 0) return null;
  return (
    <li class={`break${active ? ' break--active' : ''}`} aria-label={`Перемена ${minutes} минут`}>
      {active && minutesUntil !== undefined
        ? `Сейчас перемена · до пары ${formatDuration(minutesUntil)}`
        : `перемена ${formatDuration(minutes)}`}
    </li>
  );
}
