// Карточка предмета: крупная иконка, полное название, мой кабинет, преподаватель, ближайшие пары.

import { lessonRoom } from '../core/schedule';
import { COLOR_NAMES } from '../core/colors';
import { capitalize, formatDayMonth, formatRoom, relativeDayName, weekdayName } from '../core/format';
import { upcomingLessonsOfSubject } from '../core/week';
import { WEEKDAY_KEYS } from '../core/time';
import { updateSubjectPrefs, useSettings } from '../state/settings';
import { useAppData, useSubject } from '../shell/app';
import { useClock } from '../shell/clock';
import { navigate } from '../shell/nav';
import { Cell, Group } from '../ui/List';
import { SubjectIcon } from '../ui/SubjectIcon';
import { TextField } from '../ui/controls';
import { closeSheet } from '../ui/overlays';
import './SubjectCard.css';

export function SubjectCard({ id, inSheet = true }: { id: string; inSheet?: boolean }) {
  const subject = useSubject(id);
  const settings = useSettings();
  const { main, src } = useAppData();
  const clock = useClock('minute');
  const upcoming = upcomingLessonsOfSubject(id, clock, src, 7);

  // Мой кабинет: из ближайшей пары, а если её нет — из основного расписания.
  const anyLesson = upcoming[0] ?? WEEKDAY_KEYS.flatMap((k) => main.week[k] ?? []).find((l) => l.subjectId === id);
  const room = anyLesson ? formatRoom(lessonRoom(anyLesson, settings.subgroup)) : '';
  const hasSubgroups = WEEKDAY_KEYS.some((k) => (main.week[k] ?? []).some((l) => l.subjectId === id && l.rooms));

  const dayLabel = (date: string) => relativeDayName(date, clock.date) ?? `${capitalize(weekdayName(date))}, ${formatDayMonth(date)}`;

  return (
    <div class="subject-card">
      <div class="subject-card__head">
        <SubjectIcon color={subject.color} icon={subject.icon} size={64} />
        <h2 class="t-title1">{subject.short}</h2>
        <p class="t-callout t-secondary subject-card__full">{subject.full}</p>
        <span class="subject-card__color t-footnote">
          <span class="subject-card__dot" style={`--c:var(--sc-${subject.color})`} aria-hidden="true" />
          {COLOR_NAMES[subject.color]}
        </span>
      </div>

      <Group>
        <Cell title="Кабинет" value={room || 'Не указан'} />
        {hasSubgroups && <Cell title="Подгруппа" value={`${settings.subgroup}-я`} />}
        <Cell
          title="Преподаватель"
          accessory={
            <TextField
              label="Преподаватель"
              value={subject.teacher ?? ''}
              placeholder="Не указан"
              maxLength={80}
              onInput={(v) => updateSubjectPrefs(id, { teacher: v })}
            />
          }
          class="subject-card__teacher"
        />
      </Group>

      <Group header="Ближайшие пары">
        {upcoming.length === 0 ? (
          <Cell title={<span class="t-secondary">На этой неделе пар нет</span>} />
        ) : (
          upcoming.map((l) => (
            <Cell
              key={`${l.date}-${l.start}`}
              title={dayLabel(l.date)}
              subtitle={<span class="tabular">{`${l.start}–${l.end}`}</span>}
              value={formatRoom(lessonRoom(l, settings.subgroup)) || undefined}
            />
          ))
        )}
      </Group>

      <Group>
        <Cell
          title="Цвет, иконка и сокращение"
          accessory="chevron"
          onClick={() => {
            if (inSheet) closeSheet();
            navigate({ tab: 'settings', path: ['subjects', id] });
          }}
        />
      </Group>
    </div>
  );
}
