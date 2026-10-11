// Шторка пары: «Заменить пару» и «Добавить пару» на дату или пара во временном расписании (неделя в памяти редактора).

import { useMemo, useState } from 'preact/hooks';
import { validateLessonInput } from '../../core/changes';
import { formatDayMonth } from '../../core/format';
import { lessonRoom, type Lesson, type ResolvedLesson } from '../../core/schedule';
import { toMinutes, type DateStr } from '../../core/time';
import { newStamp } from '../../state/changes';
import { useSettings } from '../../state/settings';
import { subjectView } from '../../state/subjects';
import { useAppData, useSubject } from '../../shell/app';
import { Button, TextField } from '../../ui/controls';
import { Cell, Group, IconTile } from '../../ui/List';
import { dismissSheet, openSheet, showToast } from '../../ui/overlays';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { lessonLength, subgroupRoomsHint, suggestSlot } from './changesText';
import { ErrorList, TimeField } from './fields';
import { findTraced, planAddLesson, planEditLesson, planRemoveAdded, traceDay, type LessonInput } from './logic';
import { applyPlan } from './notify';
import { openSubjectPicker } from './SubjectPicker';

export type LessonEditorMode =
  /** Пара на дату: с lesson — заменить (добавленную — изменить), без — добавить. */
  | { kind: 'date'; date: DateStr; lesson?: ResolvedLesson }
  /** Пара временного расписания: изменения остаются в редакторе, пока его не сохранят. */
  | {
      kind: 'period';
      /** «Понедельник» — для заголовка. */
      dayTitle: string;
      lesson?: Lesson;
      /** Остальные пары этого дня — проверить, что время не накладывается. */
      others: Lesson[];
      onSave: (lesson: Lesson) => void;
      onDelete?: () => void;
    };

export function lessonEditorTitle(mode: LessonEditorMode): string {
  if (mode.kind === 'period') return mode.lesson ? 'Пара' : 'Новая пара';
  if (!mode.lesson) return 'Добавить пару';
  return mode.lesson.status === 'added' ? 'Изменить пару' : 'Заменить пару';
}

export function openLessonSheet(mode: LessonEditorMode): void {
  const id = openSheet({ title: lessonEditorTitle(mode), content: () => <LessonEditor mode={mode} close={() => dismissSheet(id)} /> });
}

const ROOM_MAX = 30;
const NOTE_MAX = 200;

function overlaps(a: Pick<Lesson, 'start' | 'end'>, b: Pick<Lesson, 'start' | 'end'>): boolean {
  try {
    return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
  } catch {
    return false;
  }
}

function LessonEditor({ mode, close }: { mode: LessonEditorMode; close: () => void }) {
  const { main, src } = useAppData();
  const settings = useSettings();
  const { subgroup } = settings;
  const name = (id: string) => subjectView(id, main, settings).short;

  // Начальные значения — один раз, при открытии.
  const initial = useMemo(() => {
    if (mode.kind === 'period') {
      const l = mode.lesson;
      const slot = l ?? suggestSlot(mode.others);
      return {
        input: { subjectId: l?.subjectId ?? '', start: slot.start, end: slot.end, room: (l && lessonRoom(l, subgroup)) ?? '' },
        note: l?.note ?? '',
        source: l,
      };
    }
    const l = mode.lesson;
    if (l) {
      return {
        input: { subjectId: l.subjectId, start: l.start, end: l.end, room: lessonRoom(l, subgroup) ?? '' },
        // У отменённой пары «заменить» — это новая пара, причина отмены к ней не относится.
        note: l.status === 'cancelled' ? '' : (l.changeNote ?? ''),
        source: l as Lesson,
      };
    }
    const day = traceDay(mode.date, src);
    const slot = suggestSlot(day.lessons.filter((t) => t.lesson.status !== 'cancelled').map((t) => t.lesson));
    return { input: { subjectId: '', ...slot, room: '' }, note: '', source: undefined };
  }, []);

  const [input, setInput] = useState<LessonInput>(initial.input);
  const [note, setNote] = useState(initial.note);
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<LessonInput>) => setInput((v) => ({ ...v, ...patch }));

  const known = (id: string) => main.subjects.some((s) => s.id === id);
  const errors = validateLessonInput({ ...input, note }, known);

  // Какие пары дня накладываются по времени (кроме самой этой пары).
  const others: Lesson[] = useMemo(() => {
    if (mode.kind === 'period') return mode.others;
    const day = traceDay(mode.date, src);
    const self = mode.lesson && mode.lesson.status !== 'cancelled' ? findTraced(day, mode.lesson)?.key : undefined;
    return day.lessons.filter((t) => t.key !== self && t.lesson.status !== 'cancelled').map((t) => t.lesson);
  }, [src]);
  const clash = errors.length ? [] : others.filter((o) => overlaps(o, input));
  const clashText = clash.length
    ? `Накладывается по времени: ${clash.map((o) => `${name(o.subjectId)} ${o.start}–${o.end}`).join(', ')}`
    : '';
  // Во временном расписании пары одного дня не должны накладываться (иначе его не сохранить).
  const blocking = mode.kind === 'period' && clashText ? [clashText] : [];

  const save = () => {
    if (errors.length || blocking.length) {
      setTried(true);
      return;
    }
    if (mode.kind === 'period') {
      const prev = mode.lesson;
      const room = input.room.trim();
      // Кабинет не трогали — кабинеты по подгруппам остаются как были.
      const keepRooms = prev?.rooms && room === (lessonRoom(prev, subgroup) ?? '');
      const lesson: Lesson = {
        start: input.start,
        end: input.end,
        subjectId: input.subjectId,
        ...(keepRooms ? { ...(prev.room !== undefined && { room: prev.room }), rooms: [...prev.rooms!] } : room ? { room } : {}),
        ...(note.trim() && { note: note.trim() }),
      };
      mode.onSave(lesson);
      close();
      return;
    }
    const { date, lesson } = mode;
    if (lesson && !findTraced(traceDay(date, src), lesson)) {
      showToast({ text: 'Пара не найдена — расписание уже поменялось', icon: 'info' });
      close();
      return;
    }
    const plan = lesson ? planEditLesson(date, lesson, input, note, src, subgroup, newStamp) : planAddLesson(date, input, note, newStamp);
    if (plan) applyPlan(plan);
    close();
  };

  const remove = () => {
    if (mode.kind === 'period') {
      mode.onDelete?.();
      close();
      return;
    }
    if (!mode.lesson) return;
    const day = traceDay(mode.date, src);
    const t = findTraced(day, mode.lesson);
    const plan = t && planRemoveAdded(t, day);
    if (plan) applyPlan(plan);
    close();
  };
  const canDelete = mode.kind === 'period' ? Boolean(mode.lesson && mode.onDelete) : mode.lesson?.status === 'added';

  const length = lessonLength(input.start, input.end);
  const roomsHint = subgroupRoomsHint(initial.source);
  const dateNote =
    mode.kind === 'date'
      ? mode.lesson && mode.lesson.status !== 'cancelled'
        ? `Изменится только ${formatDayMonth(mode.date)}.`
        : `Пара будет только ${formatDayMonth(mode.date)}.`
      : `${mode.dayTitle}: каждую неделю временного расписания.`;

  return (
    <div class="changes-sheet lesson-editor">
      <ErrorList errors={tried ? [...errors, ...blocking] : []} />
      <Group footer={dateNote}>
        <SubjectCell
          id={input.subjectId}
          onClick={() =>
            openSubjectPicker({
              selected: input.subjectId,
              onPick: (subjectId) => set({ subjectId }),
            })
          }
        />
      </Group>
      <Group footer={clashText ? <span class="changes-warning">{clashText}</span> : length ? `Длится ${length}` : undefined}>
        <Cell title="Начало" accessory={<TimeField label="Начало пары" value={input.start} onChange={(start) => set({ start })} />} />
        <Cell title="Конец" accessory={<TimeField label="Конец пары" value={input.end} onChange={(end) => set({ end })} />} />
      </Group>
      <Group footer={roomsHint || undefined}>
        <Cell
          class="changes-field"
          title="Кабинет"
          accessory={<TextField label="Кабинет" value={input.room} placeholder="Нет" maxLength={ROOM_MAX} onInput={(room) => set({ room })} />}
        />
        <Cell
          class="changes-field"
          title="Заметка"
          accessory={
            <TextField
              label="Заметка"
              value={note}
              placeholder={mode.kind === 'date' ? 'Например, перенос' : 'Необязательно'}
              maxLength={NOTE_MAX}
              onInput={setNote}
            />
          }
        />
      </Group>
      <div class="changes-buttons">
        <Button block size="lg" onClick={save}>
          Сохранить
        </Button>
        {canDelete && (
          <Button block size="lg" variant="gray" class="changes-buttons__danger" onClick={remove}>
            Удалить пару
          </Button>
        )}
      </div>
    </div>
  );
}

/** Строка «Предмет» с иконкой выбранного предмета. */
function SubjectCell({ id, onClick }: { id: string; onClick: () => void }) {
  const { main } = useAppData();
  const known = Boolean(id) && main.subjects.some((s) => s.id === id);
  const s = useSubject(id || '—');
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
