// Выбор предмета для пары или практики: предметы расписания, свои предметы и «Новый предмет…».

import { useState } from 'preact/hooks';
import type { MainSchedule, ScheduleSources, UserSubject, Week } from '../../core/schedule';
import { deleteSubject, newStamp, saveSubject, useChanges, type Undo } from '../../state/changes';
import { pickUserSubjectColor } from '../../state/subjects';
import { useAppData, useSubject } from '../../shell/app';
import { Button, TextField } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/iconData';
import { Cell, Group } from '../../ui/List';
import { dismissSheet, openSheet } from '../../ui/overlays';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { SwipeRow } from '../../ui/SwipeRow';
import { ActionCell, ErrorList } from './fields';
import { notifyChange } from './notify';

interface PickerOptions {
  selected?: string;
  onPick: (id: string) => void;
  /** Иконка нового предмета: book для обычной пары, hammer — для практики. */
  newIcon?: IconName;
}

/** Шторка «Предмет». */
export function openSubjectPicker(opts: PickerOptions): void {
  const id = openSheet({ title: 'Предмет', content: () => <SubjectPicker {...opts} close={() => dismissSheet(id)} /> });
}

const SHORT_MAX = 16;
const FULL_MAX = 60;

/** Предмет с таким сокращением (без учёта регистра и пробелов по краям). */
export function findSubjectByShort(main: MainSchedule, short: string): string | undefined {
  const key = short.trim().toLocaleLowerCase('ru');
  return main.subjects.find((s) => s.short.trim().toLocaleLowerCase('ru') === key)?.id;
}

/** Добавить свой предмет (цвет — свободный из палитры). */
export function createUserSubject(main: MainSchedule, short: string, full: string, icon: IconName): { id: string; undo: Undo } {
  const stamp = newStamp();
  const subject: UserSubject = {
    id: stamp.id,
    short: short.trim(),
    full: full.trim() || short.trim(),
    color: pickUserSubjectColor(main),
    icon,
    createdAt: stamp.now,
    updatedAt: stamp.now,
  };
  return { id: subject.id, undo: saveSubject(subject) };
}

function weekUses(week: Week, id: string): boolean {
  return Object.values(week).some((day) => (day ?? []).some((l) => l.subjectId === id));
}

/** Предмет стоит в каком-нибудь временном расписании или изменении — удалять его нельзя (пары остались бы без названия). */
export function subjectInUse(id: string, src: Pick<ScheduleSources, 'periods' | 'overrides'>): boolean {
  return (
    src.periods.some((p) => !p.deleted && (weekUses(p.week, id) || p.practice?.subjectId === id)) ||
    src.overrides.some(
      (o) => !o.deleted && (o.action === 'add' || o.action === 'replace') && o.lesson.subjectId === id,
    )
  );
}

function SubjectPicker({ selected, onPick, newIcon = 'book', close }: PickerOptions & { close: () => void }) {
  const { main, src } = useAppData();
  const { subjects: own } = useChanges();
  const [creating, setCreating] = useState(false);
  const ownIds = new Set(own.map((s) => s.id));
  const pick = (id: string) => {
    onPick(id);
    close();
  };

  if (creating) return <NewSubjectForm icon={newIcon} onCancel={() => setCreating(false)} onCreated={pick} />;

  return (
    <div class="changes-sheet">
      <Group>
        {main.subjects
          .filter((s) => !ownIds.has(s.id))
          .map((s) => (
            <SubjectChoice key={s.id} id={s.id} selected={s.id === selected} onPick={pick} />
          ))}
      </Group>
      <Group header="Свои предметы" footer={own.length ? 'Свой предмет можно удалить свайпом влево, если его нет в расписании.' : undefined}>
        {own
          .filter((s) => main.subjects.some((m) => m.id === s.id))
          .map((s) =>
            subjectInUse(s.id, src) ? (
              <SubjectChoice key={s.id} id={s.id} selected={s.id === selected} onPick={pick} />
            ) : (
              <SwipeRow
                key={s.id}
                label={s.short}
                trailing={[
                  {
                    id: 'delete',
                    label: 'Удалить',
                    icon: 'trash',
                    tone: 'danger',
                    onAction: () => notifyChange(`Предмет «${s.short}» удалён`, deleteSubject(s.id)),
                  },
                ]}
              >
                <SubjectChoice id={s.id} selected={s.id === selected} onPick={pick} />
              </SwipeRow>
            ),
          )}
        <ActionCell icon="plus" title="Новый предмет…" onClick={() => setCreating(true)} />
      </Group>
    </div>
  );
}

function SubjectChoice({ id, selected, onPick }: { id: string; selected: boolean; onPick: (id: string) => void }) {
  const s = useSubject(id);
  return (
    <Cell
      class="subject-choice"
      icon={<SubjectIcon color={s.color} icon={s.icon} />}
      title={s.short}
      subtitle={s.full !== s.short ? s.full : undefined}
      accessory={selected ? <Icon name="check" size={20} class="subject-choice__check" /> : undefined}
      label={s.full !== s.short ? `${s.short}, ${s.full}` : s.short}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onPick(id)}
    />
  );
}

function NewSubjectForm({ icon, onCancel, onCreated }: { icon: IconName; onCancel: () => void; onCreated: (id: string) => void }) {
  const { main } = useAppData();
  const [short, setShort] = useState('');
  const [full, setFull] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const color = pickUserSubjectColor(main);

  const create = () => {
    const name = short.trim();
    if (!name) return setErrors(['Введи название']);
    // Такой предмет уже есть — просто выбираем его.
    const existing = findSubjectByShort(main, name);
    if (existing) return onCreated(existing);
    const { id, undo } = createUserSubject(main, name, full, icon);
    notifyChange(`Предмет «${name}» добавлен`, undo);
    onCreated(id);
  };

  return (
    <div class="changes-sheet">
      <div class="new-subject__preview">
        <SubjectIcon color={color} icon={icon} size={44} />
      </div>
      <ErrorList errors={errors} />
      <Group header="Новый предмет" footer="Цвет подобран сам; поменять его можно в «Настройках → Предметы».">
        <Cell
          class="changes-field"
          title="Название"
          accessory={
            <TextField
              label="Название"
              value={short}
              placeholder="Практика"
              maxLength={SHORT_MAX}
              onInput={(v) => {
                setShort(v);
                setErrors([]);
              }}
            />
          }
        />
        <Cell
          class="changes-field"
          title="Полностью"
          accessory={<TextField label="Полное название" value={full} placeholder="Необязательно" maxLength={FULL_MAX} onInput={setFull} />}
        />
      </Group>
      <div class="changes-buttons">
        <Button block size="lg" onClick={create}>
          Добавить
        </Button>
        <Button block size="lg" variant="gray" onClick={onCancel}>
          Назад
        </Button>
      </div>
    </div>
  );
}
