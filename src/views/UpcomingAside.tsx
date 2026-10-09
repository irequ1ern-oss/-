// Колонка «Ближайшее» на широком планшете: невыполненные ДЗ на неделю вперёд и события на две недели.

import { useAppData, useActions, useSubject, type EventItem } from '../shell/app';
import { useClock } from '../shell/clock';
import { navigate } from '../shell/nav';
import { Cell, EmptyState, Group, IconTile } from '../ui/List';
import { SubjectIcon } from '../ui/SubjectIcon';
import type { IconName } from '../ui/iconData';
import { dueLabel, eventDateLabel, isOverdue, upcomingEvents, upcomingHomework } from './homework/homeworkLogic';
import type { TrackedHomework } from './homework/stats';
import { useHomework } from './homework/store';
import './upcoming.css';

const EVENT_ICONS: Record<EventItem['kind'], IconName> = {
  test: 'flag',
  exam: 'graduation-cap',
  deadline: 'clock-countdown',
};

const EVENT_KINDS: Record<EventItem['kind'], string> = {
  test: 'контрольная',
  exam: 'экзамен',
  deadline: 'срок сдачи',
};

export function UpcomingAside() {
  const { events } = useAppData();
  const [items] = useHomework();
  const today = useClock('minute').date;
  const homework = upcomingHomework(items, today, 7);
  const soon = upcomingEvents(events, today, 14);

  return (
    <div class="aside-panel upcoming">
      <h2 class="t-title2">Ближайшее</h2>
      {homework.length === 0 && soon.length === 0 ? (
        <EmptyState icon="tray" title="Пока пусто" text="Здесь появятся ДЗ и события на ближайшие дни" />
      ) : (
        <>
          {homework.length > 0 && (
            <Group header="ДЗ">
              {homework.map((h) => (
                <HomeworkLine key={h.id} item={h} today={today} />
              ))}
            </Group>
          )}
          {soon.length > 0 && (
            <Group header="События">
              {soon.map((e) => (
                <EventLine key={e.id} event={e} today={today} />
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  );
}

function HomeworkLine({ item, today }: { item: TrackedHomework; today: string }) {
  const subject = useSubject(item.subjectId);
  const due = dueLabel(item.due, today);
  const overdue = isOverdue(item, today);
  return (
    <Cell
      class="upcoming__row"
      icon={<SubjectIcon color={subject.color} icon={subject.icon} size={29} />}
      title={<span class="t-subhead upcoming__title">{item.title}</span>}
      subtitle={
        <span class="t-footnote">
          {subject.short} · <span class={overdue ? 'upcoming__due is-overdue' : 'upcoming__due'}>{due}</span>
        </span>
      }
      label={`${subject.full}: ${item.title}, ${overdue ? 'срок прошёл, ' : 'срок '}${due}`}
      onClick={() => navigate({ tab: 'homework', path: [] })}
    />
  );
}

function EventLine({ event, today }: { event: EventItem; today: string }) {
  const subject = useSubject(event.subjectId);
  const { openSubject } = useActions();
  const when = eventDateLabel(event.date, today);
  return (
    <Cell
      class="upcoming__row"
      icon={<IconTile name={EVENT_ICONS[event.kind]} color={subject.color} />}
      title={<span class="t-subhead upcoming__title">{event.title}</span>}
      subtitle={<span class="t-footnote">{`${subject.short} · ${when}`}</span>}
      label={`${event.title}, ${EVENT_KINDS[event.kind]}, ${subject.full}, ${when}`}
      onClick={() => openSubject(event.subjectId)}
    />
  );
}
