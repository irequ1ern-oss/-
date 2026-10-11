// Изменения на один день: «Пар нет весь день», пары дня (отменить, вернуть, заменить), «Добавить пару».
// Один и тот же редактор — в шторке (из «Сегодня», «Недели», меню пары) и экраном в «Настройках».

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { describeOverride, describePeriodDates } from '../../core/changes';
import { formatDayMonth, formatRoom } from '../../core/format';
import { holidayOn } from '../../core/holidays';
import { activePeriod, lessonRoom, type DateOverride, type ScheduleSources } from '../../core/schedule';
import type { DateStr } from '../../core/time';
import { deleteOverrides, getChanges, newStamp } from '../../state/changes';
import { useSettings } from '../../state/settings';
import { subjectView } from '../../state/subjects';
import { useAppData, useSubject } from '../../shell/app';
import { navigate } from '../../shell/nav';
import type { BackInfo } from '../../shell/Stack';
import { Switch, TextField } from '../../ui/controls';
import { Cell, Group, IconTile } from '../../ui/List';
import { dismissSheet, openContextMenu, openSheet, showToast, type MenuItem } from '../../ui/overlays';
import { Screen } from '../../ui/Screen';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { changesPath, dayTitleLong, dayTitleShort, periodTile, wasText } from './changesText';
import { ActionCell, confirmAction } from './fields';
import { openLessonSheet } from './LessonEditor';
import {
  planDayOff,
  planDayOffNote,
  planRemoveAdded,
  planResetDay,
  planRevert,
  planToggleCancel,
  traceDay,
  type Plan,
  type TracedDay,
  type TracedLesson,
} from './logic';
import { applyPlan, notifyChange } from './notify';
import '../LessonRow.css';

/** Экран дня в «Настройках → Изменения расписания». */
export function DayEditorScreen({ date, back }: { date: DateStr; back?: BackInfo }) {
  return (
    <Screen title={dayTitleLong(date)} back={back}>
      <div class="settings changes">
        <DayEditorBody date={date} />
      </div>
    </Screen>
  );
}

/** Шторка дня: «Чт, 15 октября». */
export function openDaySheet(date: DateStr): void {
  const id = openSheet({ title: dayTitleShort(date), content: () => <DayEditorSheet date={date} close={() => dismissSheet(id)} /> });
}

/** Содержимое шторки дня. close — закрыть шторку перед переходом на другой экран. */
export function DayEditorSheet({ date, close }: { date: DateStr; close: () => void }) {
  return (
    <div class="changes-sheet">
      <DayEditorBody date={date} leave={close} />
    </div>
  );
}

function run(plan: Plan | null) {
  if (plan) applyPlan(plan);
  else showToast({ text: 'Не получилось — расписание уже поменялось', icon: 'info' });
}

function DayEditorBody({ date, leave }: { date: DateStr; leave?: () => void }) {
  const { main, src } = useAppData();
  const settings = useSettings();
  const name = (id: string) => subjectView(id, main, settings).short;
  const day = useMemo(() => traceDay(date, src), [date, src]);
  const period = activePeriod(date, src.periods);
  const dayOffMarks = day.live.filter((o) => o.action === 'cancelDay');
  const dayOff = dayOffMarks.length > 0;
  const holiday = holidayOn(date);

  return (
    <>
      {period && (
        <Group>
          <Cell
            icon={<IconTile name={periodTile(period.kind).icon} color={periodTile(period.kind).color} />}
            title={`По временному расписанию «${period.title}»`}
            subtitle={describePeriodDates(period)}
            accessory="chevron"
            onClick={() => {
              leave?.();
              navigate({ tab: 'settings', path: changesPath({ screen: 'period', id: period.id }) });
            }}
          />
        </Group>
      )}

      <Group
        footer={
          !dayOff && holiday
            ? `Праздник: ${holiday.name}. Пар, скорее всего, не будет.`
            : dayOff
              ? 'Пары, добавленные после этой отметки, останутся.'
              : undefined
        }
      >
        <Cell
          icon={<IconTile name="calendar-x" color="red" />}
          title="Пар нет весь день"
          accessory={
            <Switch
              label="Пар нет весь день"
              checked={dayOff}
              onChange={(on) => {
                const plan = planDayOff(date, on, '', src, newStamp);
                if (plan) applyPlan(plan);
              }}
            />
          }
        />
        {dayOff && <ReasonCell date={date} marks={dayOffMarks} src={src} />}
      </Group>

      <Group
        header="Пары"
        footer={day.lessons.length ? 'Нажми на пару, чтобы отменить, вернуть или заменить её. Меняется только этот день.' : 'В этот день пар нет.'}
      >
        {day.lessons.map((t) => (
          <EditableLesson key={t.key} t={t} day={day} date={date} src={src} />
        ))}
        <ActionCell icon="plus" title="Добавить пару" onClick={() => openLessonSheet({ kind: 'date', date })} />
      </Group>

      {day.unmatched.length > 0 && (
        <Group header="Не применились" footer="Такой пары в этот день нет — возможно, расписание поменялось. Эти изменения можно удалить.">
          {day.unmatched.map((o) => (
            <UnmatchedRow key={o.id} o={o} text={describeOverride(o, name, src)} />
          ))}
        </Group>
      )}

      {day.live.length > 0 && (
        <Group>
          <ActionCell
            icon="arrow-u-up-left"
            danger
            title="Сбросить изменения дня"
            onClick={async () => {
              const ok = await confirmAction({
                title: 'Сбросить изменения?',
                text: `Всё, что поменяли на ${formatDayMonth(date)}, вернётся как по расписанию.`,
                confirmLabel: 'Сбросить',
              });
              if (ok) run(planResetDay(date, src));
            }}
          />
        </Group>
      )}
    </>
  );
}

/** Причина «Пар нет весь день»: сохраняется, когда поле теряет фокус (или по Enter). */
function ReasonCell({ date, marks, src }: { date: DateStr; marks: DateOverride[]; src: ScheduleSources }) {
  const saved = marks[0]?.note ?? '';
  const [value, setValue] = useState(saved);
  // Причину поменяли в другом месте (или отменили изменение) — показываем новую.
  useEffect(() => setValue(saved), [saved, marks[0]?.id]);
  const latest = useRef({ value, saved, src });
  latest.current = { value, saved, src };
  const commit = () => {
    const { value: v, saved: s, src: current } = latest.current;
    if (v.trim() === s.trim()) return;
    // Отметки берём из хранилища: если «Пар нет весь день» уже выключили, причину сохранять некуда
    // (иначе сохранение вернуло бы удалённую отметку).
    const plan = planDayOffNote(date, v, { ...current, overrides: getChanges().overrides });
    if (plan) applyPlan(plan);
  };
  // Шторку закрыли, не убрав фокус с поля, — всё равно сохраняем.
  useEffect(() => () => commit(), []);
  return (
    <Cell
      class="changes-field"
      title="Причина"
      onFocusOut={commit}
      accessory={<TextField label="Причина" value={value} placeholder="праздник, выходной…" maxLength={200} onInput={setValue} />}
    />
  );
}

const STATUS: Record<string, string> = { cancelled: 'отменена', changed: 'замена', added: 'добавлена' };

/** Пара дня: нажатие — меню действий (как долгое нажатие на «Сегодня», только сразу). */
function EditableLesson({ t, day, date, src }: { t: TracedLesson; day: TracedDay; date: DateStr; src: ScheduleSources }) {
  const { lesson } = t;
  const settings = useSettings();
  const { main } = useAppData();
  const subject = useSubject(lesson.subjectId);
  const room = formatRoom(lessonRoom(lesson, settings.subgroup));
  const status = STATUS[lesson.status];
  const time = `${lesson.start}–${lesson.end}`;
  const was = lesson.status === 'changed' ? wasText(lesson, lesson.original, settings.subgroup, (id) => subjectView(id, main, settings).short) : '';
  const extra = [was, lesson.changeNote, lesson.note].filter(Boolean).join(' · ');

  const row = (interactive: boolean, onClick?: (e: MouseEvent) => void) => (
    <Cell
      class={`lesson-row day-lesson lesson-row--${lesson.status}`}
      icon={<SubjectIcon color={subject.color} icon={subject.icon} />}
      title={
        <span class="lesson-row__title">
          <span class="lesson-row__short">{subject.short}</span>
          {status && <span class={`chip chip--${lesson.status}`}>{status}</span>}
        </span>
      }
      subtitle={
        <span class="tabular">
          {/* У отменённой пары зачёркнуто только время: причина и «было: …» читаются как обычно */}
          <span class="nowrap day-lesson__time">{time}</span>
          {/* «было: каб. 6 · замена кабинета» — отдельной строкой, чтобы не слипалось с кабинетом справа */}
          {extra && <span class="day-lesson__extra">{extra}</span>}
        </span>
      }
      value={room || undefined}
      label={
        interactive
          ? `${subject.full}, ${time}${room ? `, ${room}` : ''}${status ? `, ${status}` : ''}${extra ? `, ${extra}` : ''}. Действия`
          : undefined
      }
      aria-haspopup={interactive ? 'menu' : undefined}
      onClick={onClick}
    />
  );

  const items = (): MenuItem[] => {
    const edit = () => openLessonSheet({ kind: 'date', date, lesson });
    if (lesson.status === 'cancelled')
      return [
        { label: 'Вернуть пару', icon: 'arrow-u-up-left', onSelect: () => run(planToggleCancel(date, lesson, src, newStamp)) },
        { label: 'Поставить другую…', icon: 'swap', onSelect: edit },
      ];
    if (lesson.status === 'added')
      return [
        { label: 'Изменить…', icon: 'pencil-simple', onSelect: edit },
        { label: 'Удалить пару', icon: 'trash', destructive: true, onSelect: () => run(planRemoveAdded(t, day)) },
      ];
    const list: MenuItem[] = [{ label: 'Заменить…', icon: 'swap', onSelect: edit }];
    if (lesson.status === 'changed') list.push({ label: 'Вернуть как было', icon: 'arrow-u-up-left', onSelect: () => run(planRevert(t, day)) });
    list.push({ label: 'Отменить пару', icon: 'calendar-x', destructive: true, onSelect: () => run(planToggleCancel(date, lesson, src, newStamp)) });
    return list;
  };

  return row(true, (e) => {
    const cell = ((e.currentTarget as HTMLElement).closest('.cell') ?? e.currentTarget) as HTMLElement;
    const r = cell.getBoundingClientRect();
    openContextMenu({
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      preview: () => <div class="lesson-row-preview">{row(false)}</div>,
      items: items(),
    });
  });
}

/** Изменение, для которого не нашлась пара: показываем и даём удалить. */
function UnmatchedRow({ o, text }: { o: DateOverride; text: string }) {
  const row = (onClick?: (e: MouseEvent) => void) => (
    <Cell
      icon={<IconTile name="info" color="gray" />}
      title={
        <span class="changes-row__title">
          <span>{text}</span>
          <span class="chip chip--changed">пара не найдена</span>
        </span>
      }
      label={onClick ? `${text}, пара не найдена. Действия` : undefined}
      aria-haspopup={onClick ? 'menu' : undefined}
      onClick={onClick}
    />
  );
  return row((e) => {
    const cell = ((e.currentTarget as HTMLElement).closest('.cell') ?? e.currentTarget) as HTMLElement;
    const r = cell.getBoundingClientRect();
    openContextMenu({
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      preview: () => <div class="lesson-row-preview">{row()}</div>,
      items: [
        {
          label: 'Удалить изменение',
          icon: 'trash',
          destructive: true,
          onSelect: () => notifyChange('Изменение удалено', deleteOverrides([o.id])),
        },
      ],
    });
  });
}
