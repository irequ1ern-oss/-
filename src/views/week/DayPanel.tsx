// Содержимое выбранного дня: заголовок с числом пар и кнопкой «Изменить», плашка изменений, пары и ДЗ к этому дню.

import { activeLessons, type ResolvedDay } from '../../core/schedule';
import { lessonPhase } from '../../core/today';
import { lessonsCount } from '../../core/format';
import type { Clock } from '../../core/time';
import { useSubject, type HomeworkItem } from '../../shell/app';
import { navigate } from '../../shell/nav';
import { Cell, EmptyState, Group } from '../../ui/List';
import { IconButton } from '../../ui/controls';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { openDayEditor } from '../changes/api';
import { LessonRow } from '../LessonRow';
import { ChangesBanner } from './ChangesBanner';
import { dayTitle } from './weekLogic';

interface Props {
  day: ResolvedDay;
  clock: Clock;
  homework: HomeworkItem[];
}

export function DayPanel({ day, clock, homework }: Props) {
  const count = activeLessons(day).length;
  const due = homework.filter((h) => !h.done && h.due === day.date);
  // Все пары отменены — об этом уже говорят плашка изменений и метки «отменена»; рядом с карандашом
  // длинная подпись перенесла бы заголовок дня на вторую строку.
  const countLabel = count > 0 ? lessonsCount(count) : '';
  const title = dayTitle(day.date, clock.date);

  return (
    <>
      <div class="week-day__head">
        <h2 class="week-day__title t-headline">{title}</h2>
        {countLabel && <span class="week-day__count t-subhead t-secondary">{countLabel}</span>}
        <IconButton
          icon="pencil-simple"
          label={`Изменить день: ${title}`}
          variant="plain"
          size={36}
          class="week-day__edit"
          onClick={() => openDayEditor(day.date)}
        />
      </div>

      <ChangesBanner day={day} />

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
