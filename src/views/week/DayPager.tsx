// Листание дней свайпом. Лента из трёх дней: вчерашний и завтрашний стоят по бокам за краем экрана.
// Содержимое едет за пальцем; отпустили дальше четверти ширины или «бросили» — день уезжает
// и въезжает соседний, иначе лента пружинит назад. Вертикальная прокрутка не мешает: ось
// определяется после первых 10 px, а touch-action: pan-y отдаёт вертикаль браузеру.
// Долгое нажатие на пару открыло контекстное меню — жест больше не листает дни, лента пружинит назад.

import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import type { DateStr } from '../../core/time';
import { useOverlayState } from '../../ui/overlays';
import { swipeOutcome } from './weekLogic';

/** Переход к дню, который сейчас анимируется. */
export interface PendingMove {
  date: DateStr;
  dir: 1 | -1;
}

interface Props {
  selected: DateStr;
  prev: DateStr;
  next: DateStr;
  pending: PendingMove | null;
  renderDay: (date: DateStr) => ComponentChildren;
  panelId: string;
  labelledBy: string;
  /** Свайп решил: перейти на соседний день. */
  onSwipe: (dir: 1 | -1) => void;
  /** Анимация перехода закончилась — новый день становится текущим. */
  onSettled: () => void;
}

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  axis: 'x' | 'y' | null;
  dx: number;
  width: number;
  samples: { x: number; t: number }[];
}

const AXIS_LOCK = 10;
/** По каким последним движениям считать скорость «броска», мс. */
const VELOCITY_WINDOW = 100;
const TRANSITION = 'transform var(--dur-2) var(--ease-ios)';
/** Запасной таймер, если transitionend не придёт (вкладку свернули и т. п.). */
const FALLBACK_MS = 600;

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function DayPager(props: Props) {
  const { selected, prev, next, pending, renderDay, panelId, labelledBy } = props;
  const pager = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const mode = useRef<'drag' | 'back' | 'commit' | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const fallback = useRef<number | undefined>(undefined);

  // Обработчики живут всё время экрана и читают актуальные данные через ref.
  const g = useMemo(() => {
    const setX = (x: number, animated: boolean) => {
      const el = track.current;
      if (!el) return;
      el.style.transition = animated ? TRANSITION : 'none';
      el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    };

    /** Лента на месте, соседние дни спрятаны. */
    const reset = () => {
      window.clearTimeout(fallback.current);
      mode.current = null;
      const el = track.current;
      if (!el) return;
      delete el.dataset.moving;
      el.style.transition = '';
      el.style.transform = '';
    };

    const settle = () => {
      window.clearTimeout(fallback.current);
      if (mode.current === 'commit') {
        mode.current = null;
        latest.current.onSettled();
      } else if (mode.current === 'back') {
        reset();
      }
    };

    const springBack = () => {
      mode.current = 'back';
      setX(0, true);
      window.clearTimeout(fallback.current);
      fallback.current = window.setTimeout(settle, FALLBACK_MS);
    };

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      gesture.current = null;
    };

    const onMove = (e: PointerEvent) => {
      const s = gesture.current;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      if (!s.axis) {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        // Вертикально или ещё идёт переход — жест не наш.
        if (Math.abs(dx) <= Math.abs(dy) || latest.current.pending || mode.current === 'commit') {
          detach();
          return;
        }
        s.axis = 'x';
        // Отсчёт от точки захвата: лента не «прыгает» на 10 px.
        s.x0 = e.clientX;
        s.samples = [{ x: e.clientX, t: e.timeStamp }];
        window.clearTimeout(fallback.current);
        mode.current = 'drag';
        if (!reducedMotion() && track.current) track.current.dataset.moving = '';
      }
      s.dx = e.clientX - s.x0;
      s.samples.push({ x: e.clientX, t: e.timeStamp });
      while (s.samples.length > 2 && e.timeStamp - s.samples[0].t > VELOCITY_WINDOW) s.samples.shift();
      if (!reducedMotion()) setX(s.dx, false);
    };

    const onUp = (e: PointerEvent) => {
      const s = gesture.current;
      if (!s || e.pointerId !== s.id) return;
      detach();
      if (s.axis !== 'x') return;
      // Палец ехал по строке: отпускание не должно открыть карточку предмета.
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 300);
      const recent = [...s.samples, { x: e.clientX, t: e.timeStamp }].filter((p) => e.timeStamp - p.t <= VELOCITY_WINDOW);
      const first = recent[0];
      const dt = e.timeStamp - first.t;
      const velocity = recent.length > 1 && dt > 0 ? (e.clientX - first.x) / dt : 0;
      const dir = swipeOutcome(s.dx, velocity, s.width);
      if (dir === 0) {
        if (reducedMotion()) reset();
        else springBack();
        return;
      }
      // Дальше лента доедет в эффекте ниже, когда родитель выставит pending.
      mode.current = reducedMotion() ? null : 'drag';
      latest.current.onSwipe(dir);
    };

    const onCancel = (e: PointerEvent) => {
      const s = gesture.current;
      if (!s || e.pointerId !== s.id) return;
      detach();
      if (s.axis === 'x') {
        if (reducedMotion()) reset();
        else springBack();
      }
    };

    /** Жест перехватило контекстное меню (долгое нажатие сработало): дальше палец двигает не ленту. */
    const drop = () => {
      const s = gesture.current;
      if (!s) return;
      detach();
      if (s.axis !== 'x') return;
      if (reducedMotion()) reset();
      else springBack();
    };

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      suppressClick.current = false;
      if (gesture.current) detach();
      gesture.current = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        axis: null,
        dx: 0,
        width: pager.current?.clientWidth ?? 1,
        samples: [],
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target === track.current && e.propertyName === 'transform') settle();
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };

    return { setX, reset, settle, detach, drop, onDown, onTransitionEnd, onClickCapture };
  }, []);

  // Начался переход (свайп или нажатие на день) — лента доезжает до соседнего дня.
  // Закончился — новый день уже стоит в центре, ленту возвращаем на место до отрисовки кадра.
  useLayoutEffect(() => {
    const el = track.current;
    if (!el || !pending) {
      g.reset();
      return;
    }
    el.dataset.moving = '';
    // Соседний день только что стал видимым: фиксируем стили, чтобы анимация шла от текущего места.
    void el.offsetWidth;
    mode.current = 'commit';
    g.setX(-pending.dir * (pager.current?.clientWidth ?? 0), true);
    window.clearTimeout(fallback.current);
    fallback.current = window.setTimeout(g.settle, FALLBACK_MS);
  }, [pending]);

  useLayoutEffect(() => () => {
    g.detach();
    window.clearTimeout(fallback.current);
  }, []);

  const panel = (date: DateStr, slot: 'prev' | 'current' | 'next') =>
    slot === 'current' ? (
      <section key={date} id={panelId} class="week-panel" role="tabpanel" aria-labelledby={labelledBy}>
        {renderDay(date)}
      </section>
    ) : (
      <section key={date} class={`week-panel week-panel--side week-panel--${slot}`} aria-hidden="true" inert>
        {renderDay(date)}
      </section>
    );

  return (
    <div ref={pager} class="week-pager" onPointerDown={g.onDown} onClickCapture={g.onClickCapture}>
      <div ref={track} class="week-track" onTransitionEnd={g.onTransitionEnd}>
        {panel(prev, 'prev')}
        {panel(selected, 'current')}
        {panel(next, 'next')}
      </div>
      <MenuWatch onOpen={g.drop} />
    </div>
  );
}

/**
 * Следит за контекстным меню отдельным компонентом: при смене слоёв (шторки, уведомления)
 * перерисовывается только он, а не три дня ленты.
 */
function MenuWatch({ onOpen }: { onOpen: () => void }) {
  const { menu } = useOverlayState();
  useLayoutEffect(() => {
    if (menu) onOpen();
  }, [menu]);
  return null;
}
