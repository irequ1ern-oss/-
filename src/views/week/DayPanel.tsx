// Содержимое выбранного дня: заголовок с числом пар, плашка изменений, пары и ДЗ к этому дню.

import { activeLessons, dayHasChanges, type ResolvedDay } from '../../core/schedule';
import { lessonPhase } from '../../core/today';
import { capitalize, formatDDMM, formatDayLong, lessonsCount } from '../../core/format';
import type { Clock } from '../../core/time';
import { useSubject, type HomeworkItem } from '../../shell/app';
import { navigate } from '../../shell/nav';
import { Cell, EmptyState, Group } from '../../ui/List';
import { Icon } from '../../ui/Icon';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { LessonRow } from '../LessonRow';

interface Props {
  day: ResolvedDay;
  clock: Clock;
  homework: HomeworkItem[];
}

export function DayPanel({ day, clock, homework }: Props) {
  const count = activeLessons(day).length;
  const due = homework.filter((h) => !h.done && h.due === day.date);
  const isToday = day.date === clock.date;
  const countLabel = count > 0 ? lessonsCount(count) : day.lessons.length > 0 ? 'Пары отменены' : '';

  return (
    <>
      <div class="week-day__head">
        <h2 class="week-day__title t-headline">
          {capitalize(formatDayLong(day.date))}
          {isToday && <span class="week-day__tag t-caption">сегодня</span>}
        </h2>
        {countLabel && <span class="week-day__count t-subhead t-secondary">{countLabel}</span>}
      </div>

      {dayHasChanges(day) && (
        <div class="week-changes" role="note">
          <Icon name="swap" size={20} weight="fill" class="week-changes__icon" />
          <span class="week-changes__text">
            <span class="t-subhead week-changes__title">Есть изменения в расписании</span>
            {day.period && <span class="t-footnote">{`${day.period.title} до ${formatDDMM(day.period.to)}`}</span>}
          </span>
        </div>
      )}

      {day.lessons.length === 0 ? (
        <EmptyState icon="coffee" title="Пар нет" text={day.period?.title} />
      ) : (
        <Group>
          {day.lessons.map((l, i) => (
            <LessonRow key={`${l.start}-${i}`} lesson={l} phase={lessonPhase(l, clock)} />
          ))}
        </Group>
      )}

      {due.length > 0 && (
        <Group header="ДЗ к этому дню" class="week-homework">
          {due.map((h) => (
            <HomeworkRow key={h.id} item={h} />
          ))}
        </Group>
      )}
    </>
  );
}

function HomeworkRow({ item }: { item: HomeworkItem }) {
  const subject = useSubject(item.subjectId);
  return (
    <Cell
      icon={<SubjectIcon color={subject.color} icon={subject.icon} />}
      title={item.title}
      subtitle={subject.short}
      accessory="chevron"
      label={`ДЗ, ${subject.full}: ${item.title}`}
      onClick={() => navigate({ tab: 'homework', path: [] })}
    />
  );
}
