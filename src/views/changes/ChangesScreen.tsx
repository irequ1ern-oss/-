// «Настройки → Изменения расписания»: что можно поменять, временные расписания, изменения на даты и праздники.
// Удаление — свайпом влево (с подтверждением), после любого действия — уведомление с «Отменить».

import { useMemo, useState } from 'preact/hooks';
import { describeOverride, periodStatus, type DateGroup } from '../../core/changes';
import { formatDayMonth, plural } from '../../core/format';
import { holidayRows } from '../../core/holidays';
import { resolveDay, type SchedulePeriod, type ScheduleSources } from '../../core/schedule';
import type { DateStr } from '../../core/time';
import { deleteOverrides, deletePeriod, newStamp, useChanges } from '../../state/changes';
import { useSettings } from '../../state/settings';
import { subjectView } from '../../state/subjects';
import { useAppData } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { navigate } from '../../shell/nav';
import type { BackInfo } from '../../shell/Stack';
import { Switch } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Cell, EmptyState, Group, IconTile } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { SwipeRow } from '../../ui/SwipeRow';
import {
  changesPath,
  dateLines,
  dayTitleShort,
  holidayItems,
  listedDateGroups,
  periodSubtitle,
  periodTile,
  type HolidayItem,
} from './changesText';
import { ChangeActions, openDayPicker, openDaysOffSheet, openNewPeriod } from './Chooser';
import { ActionCell } from './fields';
import { planMarkHolidays, planUnmarkHolidays } from './logic';
import { applyPlan, notifyChange } from './notify';
import '../LessonRow.css';

const go = (path: string[]) => navigate({ tab: 'settings', path });

export function ChangesScreen({ back }: { back?: BackInfo }) {
  const { src } = useAppData();
  const { storageError } = useChanges();
  const { date: today } = useClock('minute');

  const periods = useMemo(() => {
    const now: SchedulePeriod[] = [];
    const past: SchedulePeriod[] = [];
    for (const p of src.periods) (periodStatus(p, today) === 'past' ? past : now).push(p);
    // Прошедшие — от недавних к старым.
    past.sort((a, b) => (a.to > b.to ? -1 : a.to < b.to ? 1 : 0));
    return { now, past };
  }, [src.periods, today]);
  const dates = useMemo(() => listedDateGroups(src.overrides, today), [src.overrides, today]);
  const nothing = !src.periods.length && !dates.upcoming.length && !dates.past.length;

  return (
    <Screen title="Изменения расписания" back={back}>
      <div class="settings changes">
        <Group>
          <ChangeActions
            onDay={() => openDayPicker((date) => go(changesPath({ screen: 'day', date })))}
            onDaysOff={() => openDaysOffSheet()}
            onPeriod={openNewPeriod}
          />
        </Group>

        {nothing && (
          <EmptyState
            plain
            class="changes-empty"
            icon="calendar-dots"
            title="Изменений пока нет"
            text="Здесь появятся временные расписания и изменения на отдельные дни."
          />
        )}

        {(periods.now.length > 0 || periods.past.length > 0) && (
          <Group header="Временное расписание" footer="Когда расписание закончится, снова действует основное.">
            {periods.now.map((p) => (
              <PeriodRow key={p.id} p={p} today={today} />
            ))}
            <PastDisclosure count={periods.past.length} label="Прошедшие расписания">
              {periods.past.map((p) => (
                <PeriodRow key={p.id} p={p} today={today} dimmed />
              ))}
            </PastDisclosure>
          </Group>
        )}

        {(dates.upcoming.length > 0 || dates.past.length > 0) && (
          <Group header="Изменения на даты" footer={dates.holidays > 0 ? 'Отмеченные праздники — ниже, в «Праздниках».' : undefined}>
            {dates.upcoming.map((g) => (
              <DateRow key={g.date} group={g} src={src} />
            ))}
            <PastDisclosure count={dates.past.length} label="Прошедшие изменения">
              {dates.past.map((g) => (
                <DateRow key={g.date} group={g} src={src} dimmed />
              ))}
            </PastDisclosure>
          </Group>
        )}

        <HolidaysGroup src={src} today={today} />

        {storageError && <p class="settings-note changes-note t-footnote">{storageError}</p>}
      </div>
    </Screen>
  );
}

/** Строка «Прошедшие (3)»: по нажатию под ней раскрываются прошедшие строки. */
function PastDisclosure({ count, label, children }: { count: number; label: string; children: preact.ComponentChildren }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <>
      <Cell
        class={`changes-disclosure${open ? ' is-open' : ''}`}
        icon={<IconTile name="clock" color="gray" />}
        title={`Прошедшие (${count})`}
        accessory={<Icon name="caret-down" size={16} class="changes-disclosure__caret" />}
        label={`${label}: ${count}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div class="changes-disclosure__list" role="group" aria-label={label}>
          {children}
        </div>
      )}
    </>
  );
}

function PeriodRow({ p, today, dimmed }: { p: SchedulePeriod; today: DateStr; dimmed?: boolean }) {
  const tile = periodTile(p.kind);
  return (
    <SwipeRow
      label={`«${p.title}»`}
      trailing={[
        {
          id: 'delete',
          label: 'Удалить',
          icon: 'trash',
          tone: 'danger',
          confirm: { title: 'Удалить расписание?', confirmLabel: 'Удалить' },
          onAction: () => notifyChange(`Расписание «${p.title}» удалено`, deletePeriod(p.id)),
        },
      ]}
    >
      <Cell
        icon={<IconTile name={tile.icon} color={tile.color} />}
        title={p.title}
        subtitle={periodSubtitle(p, today)}
        accessory="chevron"
        dimmed={dimmed}
        onClick={() => go(changesPath({ screen: 'period', id: p.id }))}
      />
    </SwipeRow>
  );
}

function DateRow({ group, src, dimmed }: { group: DateGroup; src: ScheduleSources; dimmed?: boolean }) {
  const { main } = useAppData();
  const settings = useSettings();
  const name = (id: string) => subjectView(id, main, settings).short;
  const { date, overrides } = group;
  const lines = dateLines(overrides.map((o) => describeOverride(o, name, src)));
  const lost = resolveDay(date, src).unmatched.length > 0;
  const title = dayTitleShort(date);
  return (
    <SwipeRow
      label={title}
      trailing={[
        {
          id: 'delete',
          label: 'Удалить',
          icon: 'trash',
          tone: 'danger',
          confirm: { title: 'Удалить изменения дня?', confirmLabel: 'Удалить' },
          onAction: () => notifyChange(`Изменения на ${formatDayMonth(date)} удалены`, deleteOverrides(overrides.map((o) => o.id))),
        },
      ]}
    >
      <Cell
        class="changes-date"
        icon={<span class="date-tile tabular" aria-hidden="true">{Number(date.slice(8))}</span>}
        title={
          <span class="changes-row__title">
            <span>{title}</span>
            {lost && <span class="chip chip--changed">пара не найдена</span>}
          </span>
        }
        subtitle={<span class="changes-lines">{lines}</span>}
        accessory="chevron"
        dimmed={dimmed}
        label={`${title}. ${lines.replace(/\n/g, '. ')}${lost ? '. Пара не найдена' : ''}`}
        onClick={() => go(changesPath({ screen: 'day', date }))}
      />
    </SwipeRow>
  );
}

/** Государственные праздники с переключателем «Пар нет весь день». */
function HolidaysGroup({ src, today }: { src: ScheduleSources; today: DateStr }) {
  const items = useMemo(() => holidayItems(holidayRows(today, src)), [today, src]);
  if (!items.length) return null;
  const unmarked = items.flatMap((it) => it.holidays.filter((h) => !it.marks.some((m) => m.date === h.date)));
  const toggle = (it: HolidayItem, on: boolean) => {
    const plan = on
      ? planMarkHolidays(
          it.holidays.filter((h) => !it.marks.some((m) => m.date === h.date)),
          newStamp,
        )
      : planUnmarkHolidays(it.marks);
    if (plan) applyPlan(plan);
  };
  return (
    <Group
      header="Праздники"
      footer="Это праздники по Трудовому кодексу. Переносы выходных правительство объявляет каждый год — их можно отметить через «Выходной день»."
    >
      {items.map((it) => (
        <Cell
          key={it.key}
          icon={<IconTile name="confetti" color="orange" />}
          title={it.title}
          subtitle={it.subtitle}
          accessory={<Switch label={it.label} checked={it.on} onChange={(on) => toggle(it, on)} />}
        />
      ))}
      {unmarked.length >= 2 && (
        <ActionCell
          icon="check-circle"
          title="Отметить все"
          subtitle={`${unmarked.length} ${plural(unmarked.length, 'праздничный день', 'праздничных дня', 'праздничных дней')}`}
          onClick={() => {
            const plan = planMarkHolidays(unmarked, newStamp);
            if (plan) applyPlan(plan);
          }}
        />
      )}
    </Group>
  );
}
