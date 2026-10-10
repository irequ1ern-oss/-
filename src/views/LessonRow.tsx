// Строка пары в списке: иконка предмета, сокращение, время, кабинет.
// Нажатие — карточка предмета, долгое нажатие — контекстное меню.

import { Fragment } from 'preact';
import type { ResolvedLesson } from '../core/schedule';
import { lessonRoom } from '../core/schedule';
import type { LessonPhase } from '../core/today';
import { formatRoom } from '../core/format';
import { useSettings } from '../state/settings';
import { useActions, useSubject } from '../shell/app';
import { Cell } from '../ui/List';
import { SubjectIcon } from '../ui/SubjectIcon';
import { useLongPress } from '../ui/gestures';
import { openContextMenu, type MenuItem } from '../ui/overlays';
import './LessonRow.css';

interface Props {
  lesson: ResolvedLesson;
  phase?: LessonPhase;
  /** Дополнение к времени: «через 33 мин». */
  extra?: string;
}

const STATUS: Partial<Record<ResolvedLesson['status'], string>> = {
  cancelled: 'отменена',
  changed: 'замена',
  added: 'добавлена',
};

export function LessonRow({ lesson, phase = 'upcoming', extra }: Props) {
  const subject = useSubject(lesson.subjectId);
  const { subgroup } = useSettings();
  const { openSubject } = useActions();
  const room = formatRoom(lessonRoom(lesson, subgroup));
  const status = STATUS[lesson.status];
  const time = `${lesson.start}–${lesson.end}`;
  // Части подписи не разрываются внутри («через 37 мин», «идёт сейчас») — перенос только между ними.
  const parts = [time, phase === 'current' ? 'идёт сейчас' : extra].filter((p): p is string => Boolean(p));
  const subtitle = (
    <span class="tabular">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          <span class="nowrap">{p}</span>
        </Fragment>
      ))}
      {/* Пометка к паре из data/schedule.json («принести штангенциркуль») — переносится как обычный текст */}
      {lesson.note && <span class="lesson-row__note"> · {lesson.note}</span>}
    </span>
  );

  const row = (interactive: boolean) => (
    <Cell
      class={`lesson-row lesson-row--${lesson.status}`}
      style={`--hl:var(--sc-${subject.color})`}
      icon={<SubjectIcon color={subject.color} icon={subject.icon} />}
      title={
        <span class="lesson-row__title">
          <span class="lesson-row__short">{subject.short}</span>
          {status && <span class={`chip chip--${lesson.status}`}>{status}</span>}
        </span>
      }
      subtitle={subtitle}
      value={room || undefined}
      highlight={phase === 'current'}
      dimmed={phase === 'past'}
      label={interactive ? `${subject.full}, ${time}${room ? `, ${room}` : ''}${status ? `, ${status}` : ''}${lesson.note ? `, ${lesson.note}` : ''}` : undefined}
      {...(interactive ? press : {})}
      onClick={interactive ? press.onClick : undefined}
    />
  );

  const items: MenuItem[] = [{ label: 'О предмете', icon: 'info', onSelect: () => openSubject(lesson.subjectId) }];

  const press = useLongPress({
    onPress: () => openSubject(lesson.subjectId),
    onLongPress: (el) => {
      const cell = (el.closest('.cell') ?? el) as HTMLElement;
      const r = cell.getBoundingClientRect();
      openContextMenu({
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        preview: () => <div class="lesson-row-preview">{row(false)}</div>,
        items,
      });
    },
  });

  return row(true);
}
