// Экран «ДЗ»: кольца за неделю, задания по срокам со свайпами, свёрнутые выполненные.
// До этапа 3 настоящих ДЗ нет — экран-заглушка; в превью — примерные данные (изменения не сохраняются).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addDays } from '../../core/time';
import { useAppData, useSubject } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { ActivityRings } from '../../ui/ActivityRings';
import { Cell, EmptyState, Group } from '../../ui/List';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { SwipeRow, type SwipeAction } from '../../ui/SwipeRow';
import { haptic } from '../../ui/haptics';
import { showToast } from '../../ui/overlays';
import {
  dueLabel, groupHomework, isOverdue, postpone, postponeToastText, removeHomework, replaceHomework,
  restoreHomework, setDone, streakText,
} from './homeworkLogic';
import { hasOverdue, streakDays, weekStats, type TrackedHomework } from './stats';
import { useHomework } from './store';
import './homework.css';

/** Сколько видна галочка, прежде чем строка уйдёт в «Выполнено» (как в «Напоминаниях»). */
const CHECK_DELAY = 450;

interface RowHandlers {
  onDone: (item: TrackedHomework, done: boolean) => void;
  onPostpone: (item: TrackedHomework) => void;
  onDelete: (item: TrackedHomework) => void;
}

export function HomeworkView() {
  const { homework: source } = useAppData();
  const [items, update] = useHomework();
  const today = useClock('minute').date;
  const { groups, done } = useMemo(() => groupHomework(items, today), [items, today]);

  const handlers: RowHandlers = {
    onDone(item, value) {
      update((list) => setDone(list, item.id, value, today));
      if (value) {
        showToast({
          text: 'ДЗ отмечено',
          icon: 'check-circle',
          actionLabel: 'Отменить',
          onAction: () => update((list) => replaceHomework(list, item)),
        });
      }
    },
    onPostpone(item) {
      update((list) => postpone(list, item.id));
      showToast({
        text: postponeToastText(addDays(item.due, 1), today),
        icon: 'calendar-plus',
        actionLabel: 'Отменить',
        onAction: () => update((list) => replaceHomework(list, item)),
      });
    },
    onDelete(item) {
      const box: ReturnType<typeof removeHomework> = { items: [] };
      update((list) => {
        Object.assign(box, removeHomework(list, item.id));
        return box.items;
      });
      const removed = box.removed;
      if (!removed) return;
      showToast({
        text: 'ДЗ удалено',
        icon: 'trash',
        actionLabel: 'Отменить',
        onAction: () => update((list) => restoreHomework(list, removed.item, removed.index)),
      });
    },
  };

  if (source.length === 0) {
    return (
      <Screen title="ДЗ">
        <EmptyState icon="check-square" title="Домашних заданий пока нет" text="Появятся на этапе 3" />
      </Screen>
    );
  }

  return (
    <Screen title="ДЗ">
      <div class="homework">
        {items.length > 0 && <StatsCard items={items} today={today} />}
        {groups.map((g) => (
          <Group key={g.id} header={g.title} class={`hw-group hw-group--${g.id}`}>
            {g.items.map((h) => (
              <HomeworkRow key={h.id} item={h} today={today} {...handlers} />
            ))}
          </Group>
        ))}
        {groups.length === 0 && (
          <div class="hw-empty">
            {done.length > 0 ? (
              <EmptyState icon="check-circle" title="Всё сделано" text="Невыполненных заданий нет" />
            ) : (
              <EmptyState icon="check-square" title="Заданий нет" text="Новые ДЗ появятся здесь" />
            )}
          </div>
        )}
        {done.length > 0 && <DoneGroup items={done} today={today} handlers={handlers} />}
      </div>
    </Screen>
  );
}

// ---------- Кольца за неделю ----------

function StatsCard({ items, today }: { items: TrackedHomework[]; today: string }) {
  const s = weekStats(items, today);
  const streak = streakDays(items, today);
  const overdue = hasOverdue(items, today);
  const rings = [
    { value: s.total ? s.done / s.total : 0, color: 'var(--accent)', label: 'Сделано', caption: `${s.done} из ${s.total}` },
    { value: s.total ? s.onTime / s.total : 0, color: 'var(--success)', label: 'Вовремя', caption: `${s.onTime} из ${s.total}` },
  ];
  return (
    <Group header="Эта неделя" class="hw-stats">
      <div class="hw-stats__main">
        <ActivityRings rings={rings} size={108} stroke={14} />
        {s.total > 0 ? (
          <dl class="hw-stats__legend">
            <div class="hw-stats__item" style="--c:var(--accent)">
              <dt class="t-subhead">Сделано</dt>
              <dd class="t-title2 tabular">{`${s.done} из ${s.total}`}</dd>
            </div>
            <div class="hw-stats__item" style="--c:var(--success)">
              <dt class="t-subhead">Вовремя</dt>
              <dd class="t-title2 tabular">{s.onTime}</dd>
            </div>
          </dl>
        ) : (
          <p class="hw-stats__none t-subhead t-secondary">На этой неделе заданий нет</p>
        )}
      </div>
      <div class={`hw-stats__streak${streak > 0 ? '' : ' is-broken'}`}>
        <Icon name="flame" weight="fill" size={20} class="hw-stats__flame" />
        <span class="t-subhead">{streakText(streak, overdue)}</span>
      </div>
    </Group>
  );
}

// ---------- Строка задания ----------

function HomeworkRow({ item, today, onDone, onPostpone, onDelete }: { item: TrackedHomework; today: string } & RowHandlers) {
  const subject = useSubject(item.subjectId);
  // Галочка ставится сразу, а строка переезжает чуть позже — чтобы было видно отметку.
  const [pending, setPending] = useState<boolean | null>(null);
  const [animate, setAnimate] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const commit = useRef<(() => void) | null>(null);

  useEffect(() => setPending(null), [item.done]);
  // Ушли с экрана, пока галочка ждала, — отметку не теряем.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      commit.current?.();
    },
    [],
  );

  const checked = pending ?? item.done;
  const overdue = isOverdue(item, today) && !checked;
  const due = dueLabel(item.due, today, item.done);

  const toggle = () => {
    haptic();
    setAnimate(true);
    window.clearTimeout(timer.current);
    commit.current = null;
    const next = !checked;
    if (next === item.done) {
      setPending(null);
      return;
    }
    setPending(next);
    commit.current = () => {
      commit.current = null;
      onDone(item, next);
    };
    timer.current = window.setTimeout(() => commit.current?.(), CHECK_DELAY);
  };

  const leading: SwipeAction = item.done
    ? { id: 'undone', label: 'Вернуть', icon: 'arrow-u-up-left', tone: 'info', onAction: () => onDone(item, false) }
    : { id: 'done', label: 'Сделано', icon: 'check', tone: 'success', onAction: () => onDone(item, true) };
  const trailing: SwipeAction[] = [
    {
      id: 'delete',
      label: 'Удалить',
      icon: 'trash',
      tone: 'danger',
      confirm: { title: 'Удалить ДЗ?', confirmLabel: 'Удалить' },
      onAction: () => onDelete(item),
    },
  ];
  if (!item.done) {
    trailing.push({ id: 'postpone', label: 'Перенести', icon: 'calendar-plus', tone: 'warning', onAction: () => onPostpone(item) });
  }

  return (
    <SwipeRow leading={leading} trailing={trailing} label={`${subject.short} — ${item.title}`}>
      <div class={`hw-row${checked ? ' is-done' : ''}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label="Отметить выполненным"
          class={`hw-check${checked ? ' is-checked' : ''}${animate ? ' is-animated' : ''}`}
          onClick={toggle}
        >
          <span key={String(checked)} class="hw-check__circle" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
        </button>
        <SubjectIcon color={subject.color} icon={subject.icon} size={29} class="hw-row__icon" />
        <span class="hw-row__text">
          <span class="hw-row__title">{item.title}</span>
          <span class="hw-row__subtitle t-subhead">
            {subject.short} · <span class={overdue ? 'hw-row__due is-overdue' : 'hw-row__due'}>{due}</span>
          </span>
        </span>
      </div>
    </SwipeRow>
  );
}

// ---------- Выполненные ----------

function DoneGroup({ items, today, handlers }: { items: TrackedHomework[]; today: string; handlers: RowHandlers }) {
  const [open, setOpen] = useState(false);
  return (
    <Group class="hw-done">
      <Cell
        class="hw-done__toggle"
        icon={
          <span class="hw-done__icon">
            <Icon name="check" size={16} />
          </span>
        }
        title={`Выполнено (${items.length})`}
        accessory={<Icon name="caret-down" size={16} class={`cell__chevron hw-done__caret${open ? ' is-open' : ''}`} />}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      />
      {open && items.map((h) => <HomeworkRow key={h.id} item={h} today={today} {...handlers} />)}
    </Group>
  );
}
