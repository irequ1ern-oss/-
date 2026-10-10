// Жесты: долгое нажатие.

import { useRef } from 'preact/hooks';
import { haptic } from './haptics';

interface LongPressOptions {
  onLongPress: (target: HTMLElement) => void;
  onPress?: (target: HTMLElement) => void;
  delay?: number;
}

/**
 * Глотает один «клик», который браузер пришлёт, когда палец отпустят после долгого нажатия.
 * Иначе этот клик попадает в слой только что открытого меню и сразу его закрывает.
 * Ждём отпускания сколько угодно; после него клик приходит почти сразу — даём ему 400 мс.
 */
function swallowReleaseClick(onDone: () => void) {
  let timer: number | undefined;
  const done = () => {
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', done, true);
    window.clearTimeout(timer);
    onDone();
  };
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const onUp = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(done, 400);
  };
  window.addEventListener('click', onClick, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', done, true);
}

/**
 * Долгое нажатие (≈0,45 с) и обычное нажатие на одном элементе.
 * Сдвиг пальца больше 10 px отменяет долгое нажатие (значит, человек прокручивает список).
 * Правый клик мыши и системное долгое нажатие Android (событие contextmenu) тоже открывают меню.
 */
export function useLongPress({ onLongPress, onPress, delay = 450 }: LongPressOptions) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  /** Палец (кнопка мыши) сейчас нажат на элементе — после меню придёт клик отпускания. */
  const down = useRef(false);

  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  };

  const release = () => {
    down.current = false;
    cancel();
  };

  const fire = (target: HTMLElement) => {
    fired.current = true;
    haptic('medium');
    if (down.current) {
      down.current = false;
      swallowReleaseClick(() => (fired.current = false));
    }
    onLongPress(target);
  };

  return {
    onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      fired.current = false;
      down.current = true;
      start.current = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget as HTMLElement;
      timer.current = window.setTimeout(() => {
        start.current = null;
        fire(target);
      }, delay);
    },
    onPointerMove(e: PointerEvent) {
      if (!start.current) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      // Таймер уже открыл меню (или наоборот: contextmenu пришёл раньше таймера) — второй раз не открываем.
      if (fired.current) return;
      cancel();
      fire(e.currentTarget as HTMLElement);
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
