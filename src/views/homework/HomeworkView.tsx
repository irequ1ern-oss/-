// Экран «ДЗ»: кольца за неделю, задания по срокам со свайпами, свёрнутые выполненные.

import { useMemo, useState } from 'preact/hooks';
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
  dueLabel, groupHomework, isOverdue, postpone, postponedDue, postponeToastText, removeHomework,
  restoreHomework, setDone, streakText,
} from './homeworkLogic';
import { hasOverdue, streakDays, weekRings, weekStats, type TrackedHomework, type WeekRing } from './stats';
import { openStudyEditor } from '../StudyEditor';
import { Button, IconButton } from '../../ui/controls';
import { useHomework } from './store';
import './homework.css';

interface RowHandlers {
  onDone: (item: TrackedHomework, done: boolean) => void;
  onPostpone: (item: TrackedHomework) => void;
  onDelete: (item: TrackedHomework) => void;
}

export function HomeworkView() {
  const { src } = useAppData();
  const [items, update] = useHomework();
  const today = useClock('minute').date;
  const { groups, done } = useMemo(() => groupHomework(items, today), [items, today]);

  const handlers: RowHandlers = {
    async onDone(item, value) {
      if (!await update((list) => setDone(list, item.id, value, today))) return;
      if (value) {
        showToast({
          text: 'ДЗ отмечено',
          icon: 'check-circle',
          actionLabel: 'Отменить',
          onAction: () => update(list => setDone(list, item.id, false, today)),
        });
      }
    },
    async onPostpone(item) {
      const due = postponedDue(item, today, src);
      if (!await update((list) => postpone(list, item.id, due))) return;
      showToast({
        text: postponeToastText(due, today),
        icon: 'calendar-plus',
        actionLabel: 'Отменить',
        onAction: () => update(list => list.map(h => h.id === item.id && h.due === due ? { ...h, due: item.due } : h)),
      });
    },
    async onDelete(item) {
      const box: ReturnType<typeof removeHomework> = { items: [] };
      if (!await update((list) => {
        Object.assign(box, removeHomework(list, item.id));
        return box.items;
      })) return;
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

  const add = () => openStudyEditor({ kind: 'homework' });
  if (!items.length) return (
    <Screen title="ДЗ">
      <div class="study-empty">
        <Icon name="check-square" size={32} />
        <h2 class="t-title2">Заданий пока нет</h2>
        <p>Выбери предмет — подставим дату следующей пары.</p>
        <Button icon="plus" onClick={add}>Записать ДЗ</Button>
      </div>
    </Screen>
  );

  return (
    <Screen title="ДЗ" trailing={<IconButton icon="plus" label="Записать ДЗ" variant="glass" onClick={add} />}>
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

const RING_COLORS: Record<WeekRing['id'], string> = { done: 'var(--accent)', onTime: 'var(--success)' };

function StatsCard({ items, today }: { items: TrackedHomework[]; today: string }) {
  const s = weekStats(items, today);
  const streak = streakDays(items, today);
  const overdue = hasOverdue(items, today);
  // Легенда и кольца из одного списка — подписи у них не расходятся.
  const rings = weekRings(s).map((r) => ({ ...r, color: RING_COLORS[r.id] }));
  return (
    <Group header="Эта неделя" class="hw-stats">
      <div class="hw-stats__main">
        <ActivityRings rings={rings} size={108} stroke={14} />
        {s.total > 0 ? (
          <dl class="hw-stats__legend">
            {rings.map((r) => (
              <div key={r.id} class="hw-stats__item" style={`--c:${r.color}`}>
                <dt class="t-subhead">{r.label}</dt>
                <dd class="t-title2 tabular">{r.caption}</dd>
              </div>
            ))}
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
  const checked = item.done;
  const overdue = isOverdue(item, today) && !checked;
  const due = dueLabel(item.due, today, checked);
  const toggle = () => {
    haptic();
    onDone(item, !checked);
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
          aria-label={checked ? `Вернуть ДЗ: ${item.title}` : `Выполнить ДЗ: ${item.title}`}
          class={`hw-check${checked ? ' is-checked' : ''}`}
          onClick={toggle}
        >
          <span key={String(checked)} class="hw-check__circle" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
        </button>
        <SubjectIcon color={subject.color} icon={subject.icon} size={29} class="hw-row__icon" />
        <button type="button" class="hw-row__text" onClick={() => openStudyEditor({ kind: 'homework', item })}>
          <span class="hw-row__title">{item.title}</span>
          <span class="hw-row__subtitle t-subhead">
            {subject.short} · <span class={overdue ? 'hw-row__due is-overdue' : 'hw-row__due'}>{due}</span>
          </span>
        </button>
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
