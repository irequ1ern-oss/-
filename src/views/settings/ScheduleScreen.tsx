// «Основное расписание»: дни недели одним списком, свёрнуты; по нажатию пары дня раскрываются прямо под строкой.

import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { formatRoom } from '../../core/format';
import { lessonRoom, type Lesson } from '../../core/schedule';
import type { WeekdayKey } from '../../core/time';
import { useSettings } from '../../state/settings';
import { useAppData, useSubject } from '../../shell/app';
import type { BackInfo } from '../../shell/Stack';
import { Cell, Group } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { Icon } from '../../ui/Icon';
import { DAY_SHORT, DAY_TITLES, daySummary, scheduleDays } from './settingsText';

export function ScheduleScreen({ back }: { back?: BackInfo }) {
  const { main } = useAppData();
  const { subgroup } = useSettings();
  const [open, setOpen] = useState<Set<WeekdayKey>>(() => new Set());
  const toggle = (key: WeekdayKey) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Screen title="Основное расписание" back={back}>
      <div class="settings">
        {/* Один сгруппированный список, как в «Настройках» iOS: раскрытый день — строки пар с отступом под ним */}
        <Group
          class="schedule"
          footer={`Кабинеты показаны для ${subgroup}-й подгруппы. Основное расписание хранится в файле data/schedule.json. Когда поменяется семестр — попроси Claude обновить его.`}
        >
          {scheduleDays(main).map(({ key, lessons }) => {
            const expanded = open.has(key);
            return (
              <Fragment key={key}>
                <Cell
                  class={`schedule-day__head${expanded ? ' is-open' : ''}`}
                  icon={<span class="day-tile t-footnote">{DAY_SHORT[key]}</span>}
                  title={<span class="t-headline">{DAY_TITLES[key]}</span>}
                  subtitle={<span class="tabular">{daySummary(lessons)}</span>}
                  accessory={<Icon name="caret-down" size={16} class="schedule-day__caret" />}
                  aria-expanded={expanded}
                  aria-controls={expanded ? `schedule-${key}` : undefined}
                  onClick={() => toggle(key)}
                />
                {expanded && (
                  <div id={`schedule-${key}`} class="schedule-day__lessons" role="group" aria-label={DAY_TITLES[key]}>
                    {lessons.map((l, i) => (
                      <ScheduleLesson key={`${l.start}-${i}`} lesson={l} subgroup={subgroup} />
                    ))}
                  </div>
                )}
              </Fragment>
            );
          })}
        </Group>
      </div>
    </Screen>
  );
}

function ScheduleLesson({ lesson, subgroup }: { lesson: Lesson; subgroup: number }) {
  const s = useSubject(lesson.subjectId);
  const room = formatRoom(lessonRoom(lesson, subgroup));
  const time = `${lesson.start}–${lesson.end}`;
  return (
    <Cell
      icon={<SubjectIcon color={s.color} icon={s.icon} />}
      title={s.short}
      subtitle={<span class="tabular">{lesson.note ? `${time} · ${lesson.note}` : time}</span>}
      value={room || undefined}
      label={`${s.full}, ${time}${room ? `, ${room}` : ''}`}
    />
  );
}
