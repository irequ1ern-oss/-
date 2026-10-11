// Временное расписание: новое (#/settings/changes/new-practice) или существующее (#/settings/changes/period-<id>).
// Три вида: своя неделя (копия основной с правками), «Практика» (одно занятие в выбранные дни) и каникулы (пар нет).
// Правки живут в редакторе, пока не нажали «Создать» / «Готово».

import { useMemo, useRef, useState } from 'preact/hooks';
import {
  copyWeek,
  defaultPracticeSpec,
  describePractice,
  newPeriod,
  periodStatus,
  validatePeriodInput,
  validatePracticeInput,
} from '../../core/changes';
import { formatRoom } from '../../core/format';
import { lessonRoom, type Lesson, type PeriodKind, type PracticeSpec, type SchedulePeriod, type Week } from '../../core/schedule';
import { addDays, diffDays, isValidDate, toMinutes, WEEKDAY_KEYS, type DateStr, type WeekdayKey } from '../../core/time';
import { deletePeriod, newStamp, savePeriod, type Undo } from '../../state/changes';
import { useSettings } from '../../state/settings';
import { pickUserSubjectColor } from '../../state/subjects';
import { useAppData, useSubject } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { goBack } from '../../shell/nav';
import type { BackInfo } from '../../shell/Stack';
import { Button, TextField } from '../../ui/controls';
import { haptic } from '../../ui/haptics';
import { Cell, EmptyState, Group, IconTile } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { DAY_SHORT, DAY_TITLES } from '../settings/settingsText';
import {
  changesPath,
  daysCount,
  defaultPeriodDates,
  NEW_PERIOD_TITLES,
  overlapNote,
  overlappingPeriods,
  periodSavedText,
} from './changesText';
import { ActionCell, confirmAction, DateField, ErrorList, TimeField } from './fields';
import { openLessonSheet } from './LessonEditor';
import { combineUndo, notifyChange } from './notify';
import { createUserSubject, findSubjectByShort, openSubjectPicker } from './SubjectPicker';

/** Название по умолчанию (то же, что подставляет newPeriod). */
const DEFAULT_TITLES: Record<PeriodKind, string> = {
  custom: 'Временное расписание',
  practice: 'Практика',
  break: 'Каникулы',
};

/** Предмет «Практика» ещё не создан — создадим его при сохранении. */
const NEW_PRACTICE = ':new-practice';
const PRACTICE_NAME = 'Практика';

/** Дни, которые можно выбрать в шаблоне «Практика». */
const PRACTICE_DAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const TITLE_MAX = 60;
const ROOM_MAX = 30;
const NOTE_MAX = 200;

interface Draft {
  title: string;
  from: DateStr;
  to: DateStr;
  week: Week;
  practice: PracticeSpec;
}

const byStart = (a: Lesson, b: Lesson) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end);

interface ScreenProps {
  back?: BackInfo;
  /** Существующее расписание. */
  id?: string;
  /** Новое расписание этого вида. */
  kind?: PeriodKind;
}

export function PeriodEditorScreen({ back, id, kind }: ScreenProps) {
  const { src } = useAppData();
  const found = id ? src.periods.find((p) => p.id === id) : undefined;
  // Запоминаем расписание при открытии: если его удалят (кнопкой ниже или в другом окне),
  // уходящий экран не превращается в «не найдено» посреди анимации.
  const snapshot = useRef(found);
  if (!snapshot.current && found) snapshot.current = found;
  const existing = snapshot.current;

  if (id && !existing) {
    return (
      <Screen title="Расписание" back={back}>
        <div class="settings changes">
          <EmptyState icon="calendar-x" title="Расписание не найдено" text="Возможно, его уже удалили." />
        </div>
      </Screen>
    );
  }
  return <PeriodEditor existing={existing} kind={existing?.kind ?? kind ?? 'custom'} back={back} />;
}

function PeriodEditor({ existing, kind, back }: { existing?: SchedulePeriod; kind: PeriodKind; back?: BackInfo }) {
  const { main, src } = useAppData();
  const { subgroup } = useSettings();
  const { date: today } = useClock('minute');
  const body = useRef<HTMLDivElement>(null);
  const isNew = !existing;

  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) {
      return {
        title: existing.title,
        from: existing.from,
        to: existing.to,
        week: copyWeek(existing.week),
        practice: existing.practice ? { ...existing.practice, days: [...existing.practice.days] } : defaultPracticeSpec(),
      };
    }
    const dates = defaultPeriodDates(kind, today);
    return {
      title: DEFAULT_TITLES[kind],
      ...dates,
      week: kind === 'custom' ? copyWeek(main.week) : {},
      practice: defaultPracticeSpec(findSubjectByShort(main, PRACTICE_NAME) ?? NEW_PRACTICE),
    };
  });
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setSpec = (patch: Partial<PracticeSpec>) => setDraft((d) => ({ ...d, practice: { ...d.practice, ...patch } }));

  const known = (id: string) => id === NEW_PRACTICE || main.subjects.some((s) => s.id === id);
  const errors = useMemo(() => {
    const { from, to, week, practice } = draft;
    // Пустое название — не ошибка: сохраним с названием по умолчанию («Практика», «Каникулы»).
    const title = draft.title.trim() || DEFAULT_TITLES[kind];
    if (kind === 'practice') return [...validatePeriodInput({ title, from, to, week: {} }, known), ...validatePracticeInput(practice, known)];
    return validatePeriodInput({ title, from, to, week: kind === 'custom' ? week : {} }, known);
  }, [draft, main]);

  // «С» сдвигает «По» на столько же: длина промежутка сохраняется (как в «Календаре»).
  const changeFrom = (from: DateStr) => {
    const span = isValidDate(draft.from) && isValidDate(draft.to) && draft.to >= draft.from ? diffDays(draft.from, draft.to) : 0;
    set({ from, to: addDays(from, span) });
  };

  const others = overlappingPeriods({ id: existing?.id ?? '', from: draft.from, to: draft.to }, src.periods);
  const status = existing && isValidDate(draft.from) && isValidDate(draft.to) ? periodStatus({ ...existing, ...draft }, today) : undefined;
  const overlap = overlapNote(others, isNew, existing?.createdAt);
  // «12 дней · действует сейчас», дальше предложениями: «В эти дни пар не будет. Пересекается с …»
  const length = [daysCount(draft.from, draft.to), status === 'current' ? 'действует сейчас' : ''].filter(Boolean).join(' · ');
  const notes = [kind === 'break' ? 'В эти дни пар не будет.' : '', overlap].filter(Boolean);
  const datesFooter = notes.length ? [length && `${length}.`, ...notes].filter(Boolean).join(' ') : length;

  const leave = () => (back ? back.onBack() : goBack({ tab: 'settings', path: changesPath({ screen: 'list' }) }));

  const save = () => {
    if (errors.length) {
      setTried(true);
      haptic();
      // Ошибки — вверху экрана: прокручиваем к ним.
      body.current?.closest('[data-screen-scroller]')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const undos: Undo[] = [];
    let practice = draft.practice;
    if (kind === 'practice' && practice.subjectId === NEW_PRACTICE) {
      const created = createUserSubject(main, PRACTICE_NAME, 'Учебная практика', 'hammer');
      undos.push(created.undo);
      practice = { ...practice, subjectId: created.id };
    }
    const stamp = newStamp();
    const built = newPeriod(kind, draft.from, draft.to, { id: existing?.id ?? stamp.id, now: stamp.now }, {
      mainWeek: main.week,
      title: draft.title.trim() || DEFAULT_TITLES[kind],
      practice,
    });
    const period: SchedulePeriod = {
      ...built,
      ...(kind === 'custom' && { week: copyWeek(draft.week) }),
      ...(existing && { createdAt: existing.createdAt }),
    };
    undos.push(savePeriod(period));
    notifyChange(periodSavedText(kind, isNew), combineUndo(...undos));
    leave();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirmAction({
      title: 'Удалить расписание?',
      text: `С ${draft.from === draft.to ? 'этого дня' : 'этих дней'} снова будет действовать основное расписание.`,
      confirmLabel: 'Удалить',
    });
    if (!ok) return;
    notifyChange(`Расписание «${existing.title}» удалено`, deletePeriod(existing.id));
    leave();
  };

  const action = isNew ? 'Создать' : 'Готово';

  return (
    <Screen
      title={existing ? existing.title : NEW_PERIOD_TITLES[kind]}
      back={back}
      trailing={
        <Button variant="plain" class="changes-navbar-btn" onClick={save}>
          {action}
        </Button>
      }
    >
      <div ref={body} class="settings changes period-editor">
        <ErrorList errors={tried ? errors : []} />

        <Group footer={datesFooter || undefined}>
          <Cell
            class="changes-field"
            title="Название"
            accessory={
              <TextField
                label="Название"
                value={draft.title}
                placeholder={DEFAULT_TITLES[kind]}
                maxLength={TITLE_MAX}
                onInput={(title) => set({ title })}
              />
            }
          />
          <Cell title="С" accessory={<DateField label="Дата начала" value={draft.from} onChange={changeFrom} />} />
          <Cell title="По" accessory={<DateField label="Дата конца" value={draft.to} min={draft.from} onChange={(to) => set({ to })} />} />
        </Group>

        {kind === 'practice' && <PracticeFields spec={draft.practice} from={draft.from} to={draft.to} onChange={setSpec} />}

        {kind === 'custom' && (
          <WeekFields
            week={draft.week}
            subgroup={subgroup}
            onChange={(week) => set({ week })}
            onReset={async () => {
              const ok = await confirmAction({
                title: 'Скопировать заново?',
                text: 'Все правки в неделе заменятся основным расписанием.',
                confirmLabel: 'Скопировать',
              });
              if (ok) set({ week: copyWeek(main.week) });
            }}
          />
        )}

        <div class="changes-buttons">
          <Button block size="lg" onClick={save}>
            {isNew ? 'Создать' : 'Сохранить'}
          </Button>
        </div>

        {existing && (
          <Group>
            <ActionCell icon="trash" danger title="Удалить расписание" onClick={() => void remove()} />
          </Group>
        )}
      </div>
    </Screen>
  );
}

// ---------- «Практика» ----------

function PracticeFields({
  spec,
  from,
  to,
  onChange,
}: {
  spec: PracticeSpec;
  from: DateStr;
  to: DateStr;
  onChange: (patch: Partial<PracticeSpec>) => void;
}) {
  const toggleDay = (key: WeekdayKey) => {
    haptic();
    const days = spec.days.includes(key) ? spec.days.filter((d) => d !== key) : [...spec.days, key];
    onChange({ days: WEEKDAY_KEYS.filter((k) => days.includes(k)) });
  };
  return (
    <>
      <Group header="Занятие" footer="Одно и то же занятие в каждый выбранный день. Отдельный день потом можно поменять на «Неделе».">
        <PracticeSubjectCell
          id={spec.subjectId}
          onClick={() =>
            openSubjectPicker({
              selected: spec.subjectId,
              newIcon: 'hammer',
              onPick: (subjectId) => onChange({ subjectId }),
            })
          }
        />
        <Cell title="Начало" accessory={<TimeField label="Начало занятия" value={spec.start} onChange={(start) => onChange({ start })} />} />
        <Cell title="Конец" accessory={<TimeField label="Конец занятия" value={spec.end} onChange={(end) => onChange({ end })} />} />
        <Cell
          class="changes-field"
          title="Место"
          accessory={
            <TextField
              label="Место: кабинет или мастерская"
              value={spec.room ?? ''}
              placeholder="Кабинет"
              maxLength={ROOM_MAX}
              onInput={(room) => onChange({ room })}
            />
          }
        />
        <Cell
          class="changes-field"
          title="Заметка"
          accessory={
            <TextField
              label="Заметка"
              value={spec.note ?? ''}
              placeholder="Необязательно"
              maxLength={NOTE_MAX}
              onInput={(note) => onChange({ note })}
            />
          }
        />
      </Group>

      <Group header="Дни недели" footer={<span class="tabular">{describePractice(spec, from, to)}</span>}>
        <div class="weekday-chips" role="group" aria-label="Дни недели">
          {PRACTICE_DAYS.map((key) => {
            const on = spec.days.includes(key);
            return (
              <button
                key={key}
                type="button"
                class={`weekday-chip pressable${on ? ' is-on' : ''}`}
                aria-pressed={on}
                aria-label={DAY_TITLES[key]}
                onClick={() => toggleDay(key)}
              >
                {DAY_SHORT[key]}
              </button>
            );
          })}
        </div>
      </Group>
    </>
  );
}

/** Предмет практики; «Практика», которой ещё нет, показываем как будущий свой предмет. */
function PracticeSubjectCell({ id, onClick }: { id: string; onClick: () => void }) {
  const { main } = useAppData();
  const known = main.subjects.some((s) => s.id === id);
  const s = useSubject(known ? id : '—');
  if (id === NEW_PRACTICE) {
    return (
      <Cell
        icon={<SubjectIcon color={pickUserSubjectColor(main)} icon="hammer" />}
        title="Предмет"
        subtitle="Новый предмет"
        value={PRACTICE_NAME}
        accessory="chevron"
        label={`Предмет: ${PRACTICE_NAME}, новый. Выбрать другой`}
        onClick={onClick}
      />
    );
  }
  return (
    <Cell
      icon={known ? <SubjectIcon color={s.color} icon={s.icon} /> : <IconTile name="book" color="gray" />}
      title="Предмет"
      value={known ? s.short : <span class="changes-placeholder">Выбрать</span>}
      accessory="chevron"
      label={known ? `Предмет: ${s.full}` : 'Выбрать предмет'}
      onClick={onClick}
    />
  );
}

// ---------- Своя неделя ----------

/** Дни недели в редакторе: пн–сб всегда, воскресенье — только если в нём есть пары. */
function editorDays(week: Week): WeekdayKey[] {
  return WEEKDAY_KEYS.filter((k) => k !== 'sun' || (week.sun ?? []).length > 0);
}

function WeekFields({
  week,
  subgroup,
  onChange,
  onReset,
}: {
  week: Week;
  subgroup: number;
  onChange: (week: Week) => void;
  onReset: () => void;
}) {
  const setDay = (key: WeekdayKey, lessons: Lesson[]) => {
    const next: Week = { ...week };
    if (lessons.length) next[key] = [...lessons].sort(byStart);
    else delete next[key];
    onChange(next);
  };
  const edit = (key: WeekdayKey, index?: number) => {
    const lessons = week[key] ?? [];
    const lesson = index === undefined ? undefined : lessons[index];
    const others = lessons.filter((_, i) => i !== index);
    openLessonSheet({
      kind: 'period',
      dayTitle: DAY_TITLES[key],
      lesson,
      others,
      onSave: (l) => setDay(key, index === undefined ? [...lessons, l] : lessons.map((x, i) => (i === index ? l : x))),
      onDelete: index === undefined ? undefined : () => setDay(key, others),
    });
  };
  return (
    <>
      {editorDays(week).map((key) => {
        const lessons = week[key] ?? [];
        return (
          <Group key={key} header={DAY_TITLES[key]}>
            {lessons.map((l, i) => (
              <WeekLessonRow key={`${l.start}-${i}`} lesson={l} subgroup={subgroup} onClick={() => edit(key, i)} />
            ))}
            <ActionCell icon="plus" title="Добавить пару" label={`Добавить пару: ${DAY_TITLES[key].toLowerCase()}`} onClick={() => edit(key)} />
          </Group>
        );
      })}
      <Group footer="Неделя повторяется с даты «с» по дату «по». Правки на отдельные дни — на «Неделе» или в «Изменить день».">
        <ActionCell icon="arrows-clockwise" title="Скопировать основное заново" onClick={onReset} />
      </Group>
    </>
  );
}

function WeekLessonRow({ lesson, subgroup, onClick }: { lesson: Lesson; subgroup: number; onClick: () => void }) {
  const s = useSubject(lesson.subjectId);
  const room = formatRoom(lessonRoom(lesson, subgroup));
  const time = `${lesson.start}–${lesson.end}`;
  return (
    <Cell
      icon={<SubjectIcon color={s.color} icon={s.icon} />}
      title={<span class="lesson-row__short">{s.short}</span>}
      subtitle={<span class="tabular">{lesson.note ? `${time} · ${lesson.note}` : time}</span>}
      value={room || undefined}
      accessory="chevron"
      label={`${s.full}, ${time}${room ? `, ${room}` : ''}. Изменить`}
      onClick={onClick}
    />
  );
}
