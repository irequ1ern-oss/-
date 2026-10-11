// Уведомление «… · Отменить» после любого изменения расписания (как в iOS) и запись плана изменений в хранилище.

import { deleteOverrides, saveOverrides, type Undo } from '../../state/changes';
import { haptic } from '../../ui/haptics';
import { dismissToast, showToast } from '../../ui/overlays';
import type { Plan } from './logic';

/** Уведомление с «Отменить» — только у последнего изменения: старое убираем, когда появляется новое. */
let lastToast = 0;

/** Уведомление внизу с кнопкой «Отменить». Нажатие отменяет изменение один раз и коротко подтверждает это. */
export function notifyChange(text: string, undo: Undo): void {
  if (lastToast) dismissToast(lastToast);
  let used = false;
  const id = showToast({
    text,
    icon: 'check-circle',
    actionLabel: 'Отменить',
    duration: 5000,
    onAction: () => {
      if (used) return;
      used = true;
      if (lastToast === id) lastToast = 0;
      undo();
      haptic();
      showToast({ text: 'Изменение отменено', icon: 'arrow-u-up-left', duration: 2500 });
    },
  });
  lastToast = id;
}

/** Несколько отмен одной кнопкой: в обратном порядке. */
export function combineUndo(...undos: (Undo | undefined)[]): Undo {
  const list = undos.filter((u): u is Undo => Boolean(u)).reverse();
  return () => list.forEach((u) => u());
}

/** Записать план (удалить и сохранить разом) и показать уведомление с «Отменить». */
export function applyPlan(plan: Plan): Undo {
  const undo = combineUndo(
    plan.remove.length ? deleteOverrides(plan.remove) : undefined,
    plan.save.length ? saveOverrides(plan.save) : undefined,
  );
  notifyChange(plan.text, undo);
  return undo;
}
