// Жесты: долгое нажатие.

import { useRef } from 'preact/hooks';
import { haptic } from './haptics';

interface LongPressOptions {
  onLongPress: (target: HTMLElement) => void;
  onPress?: (target: HTMLElement) => void;
  delay?: number;
}

/**
 * Долгое нажатие (≈0,45 с) и обычное нажатие на одном элементе.
 * Сдвиг пальца больше 10 px отменяет долгое нажатие (значит, человек прокручивает список).
 * Правый клик мыши тоже открывает меню.
 */
export function useLongPress({ onLongPress, onPress, delay = 450 }: LongPressOptions) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  };

  return {
    onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget as HTMLElement;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        start.current = null;
        haptic('medium');
        onLongPress(target);
      }, delay);
    },
    onPointerMove(e: PointerEvent) {
      if (!start.current) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      if (!fired.current) {
        cancel();
        fired.current = true;
        onLongPress(e.currentTarget as HTMLElement);
      }
    },
    onClick(e: MouseEvent) {
      if (fired.current) {
        e.preventDefault();
        fired.current = false;
        return;
      }
      onPress?.(e.currentTarget as HTMLElement);
    },
  };
}
