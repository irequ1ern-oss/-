// Строка со свайпами, как в «Почте» iOS.
// Вправо — действие слева (leading), влево — одно-два действия справа (trailing).
// Отпустили дальше половины кнопок — строка остаётся открытой, иначе закрывается.
// Протянули дальше 60% ширины — выполняется крайнее действие (leading или первое из trailing).
// Открыта только одна строка: касание другой строки или любого места экрана закрывает её.
// Кнопки — обычные <button>: до них можно дойти клавишей Tab (строка откроется сама) и диктором.

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { Button } from './controls';
import { haptic } from './haptics';
import { Icon } from './Icon';
import type { IconName } from './iconData';
import { closeSheet, openSheet } from './overlays';
import './SwipeRow.css';

export interface SwipeAction {
  id: string;
  label: string;
  icon: IconName;
  tone: 'success' | 'warning' | 'danger' | 'info';
  onAction: () => void;
  /** Спросить подтверждение в шторке (для удаления). */
  confirm?: { title: string; confirmLabel: string };
}

interface Props {
  leading?: SwipeAction;
  /** До двух; первое — крайнее справа, оно же выполняется полным свайпом. */
  trailing?: SwipeAction[];
  children: ComponentChildren;
  /** Что это за строка — для диктора и текста в подтверждении. */
  label?: string;
}

export type SwipeSide = 'leading' | 'trailing';

/** Ширина одной кнопки действия (как --swipe-action-w в SwipeRow.css). */
export const ACTION_W = 80;
/** После скольких пикселей понятно, листают список или тянут строку. */
const AXIS_LOCK = 10;
/** Полный свайп — дальше этой доли ширины строки. */
const FULL_RATIO = 0.6;
/** Скорость «броска», пикселей в миллисекунду. */
const FLING = 0.3;
const VELOCITY_WINDOW = 100;

const TONES: Record<SwipeAction['tone'], string> = {
  success: 'var(--success-fill)',
  warning: 'var(--warning-fill)',
  danger: 'var(--danger-fill)',
  info: 'var(--info-fill)',
};

// ---------- Чистая логика жеста ----------

export interface SwipeGeometry {
  /** Ширина строки. */
  width: number;
  /** Ширина кнопок слева и справа (0 — действий с этой стороны нет). */
  leading: number;
  trailing: number;
}

export type SwipeOutcome = { kind: 'close' } | { kind: 'open' | 'full'; side: SwipeSide };

/** Смещение строки за пальцем: в сторону без действий не тянется, дальше ширины строки — тоже. */
export function clampOffset(raw: number, g: SwipeGeometry): number {
  if (raw > 0) return g.leading ? Math.min(raw, g.width) : 0;
  if (raw < 0) return g.trailing ? Math.max(raw, -g.width) : 0;
  return 0;
}

/** С какого смещения отпускание выполняет крайнее действие. */
export function fullThreshold(g: SwipeGeometry, side: SwipeSide): number {
  const open = side === 'leading' ? g.leading : g.trailing;
  return Math.max(g.width * FULL_RATIO, open + 40);
}

export function isArmed(offset: number, g: SwipeGeometry): boolean {
  if (offset === 0) return false;
  return Math.abs(offset) >= fullThreshold(g, offset > 0 ? 'leading' : 'trailing');
}

/**
 * Что делать, когда палец отпустили. velocity — пикселей в мс, «+» — вправо.
 * Бросок в сторону открытия открывает даже с малого смещения, бросок назад — закрывает.
 */
export function releaseOutcome(offset: number, velocity: number, g: SwipeGeometry): SwipeOutcome {
  if (offset === 0) return { kind: 'close' };
  const side: SwipeSide = offset > 0 ? 'leading' : 'trailing';
  const open = side === 'leading' ? g.leading : g.trailing;
  if (!open) return { kind: 'close' };
  const dist = Math.abs(offset);
  if (dist >= fullThreshold(g, side)) return { kind: 'full', side };
  const v = offset > 0 ? velocity : -velocity;
  if (v < -FLING) return { kind: 'close' };
  if (dist > open / 2 || (v > FLING && dist > AXIS_LOCK)) return { kind: 'open', side };
  return { kind: 'close' };
}

// ---------- Одна открытая строка на весь экран ----------

interface RowHandle {
  el: HTMLElement;
  close(): void;
}

let openRow: RowHandle | null = null;
/** Первое касание другой строки только закрывает открытую (как в iOS) — его нажатие гасим. */
let swallowClickUntil = 0;
let listening = false;

function onDocumentPointerDown(e: PointerEvent) {
  const row = openRow;
  const target = e.target as Element | null;
  if (!row || (target && row.el.contains(target))) return;
  openRow = null;
  row.close();
  if (target?.closest?.('.swipe-row')) swallowClickUntil = performance.now() + 700;
}

function setOpenRow(row: RowHandle | null) {
  const prev = openRow;
  openRow = row;
  if (prev && prev !== row) prev.close();
  if (row && !listening && typeof document !== 'undefined') {
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    listening = true;
  }
}

// ---------- Подтверждение ----------

/** Шторка «Удалить ДЗ?»: true — подтвердили, false — «Отмена» или шторку закрыли. */
function askConfirm(confirm: NonNullable<SwipeAction['confirm']>, context?: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (ok: boolean) => {
      if (answered) return;
      answered = true;
      resolve(ok);
    };
    const id = openSheet({
      title: confirm.title,
      content: () => <ConfirmSheet context={context} confirmLabel={confirm.confirmLabel} onAnswer={answer} sheetId={id} />,
    });
  });
}

function ConfirmSheet(props: { context?: string; confirmLabel: string; onAnswer: (ok: boolean) => void; sheetId: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // Шторку закрыли фоном, «×», Esc или свайпом вниз — это «Отмена».
  useEffect(() => () => props.onAnswer(false), []);

  const reply = (ok: boolean) => {
    props.onAnswer(ok);
    // Закрываем собственной кнопкой шторки — тогда она уезжает с анимацией.
    const close = ref.current?.closest('.sheet')?.querySelector<HTMLButtonElement>('.sheet__close');
    if (close) close.click();
    else closeSheet(props.sheetId);
  };

  return (
    <div ref={ref} class="swipe-confirm">
      {props.context && <p class="swipe-confirm__context t-subhead t-secondary">{props.context}</p>}
      <Button block size="lg" class="swipe-confirm__destructive" onClick={() => reply(true)}>
        {props.confirmLabel}
      </Button>
      <Button block size="lg" variant="gray" onClick={() => reply(false)}>
        Отмена
      </Button>
    </div>
  );
}

// ---------- Компонент ----------

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  axis: 'x' | null;
  base: number;
  geom: SwipeGeometry;
  samples: { x: number; t: number }[];
}

export function SwipeRow({ leading, trailing = [], children, label }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const latest = useRef({ leading, trailing, label });
  latest.current = { leading, trailing, label };

  // Обработчики живут всё время строки и читают свежие пропсы через ref.
  const ctl = useMemo(() => {
    let offset = 0;
    let armed = false;
    let busy = false;
    let alive = true;
    let suppressClick = false;
    let gesture: Gesture | null = null;
    let fallback: number | undefined;

    const handle: RowHandle = {
      get el() {
        return root.current as HTMLElement;
      },
      close: () => close(),
    };

    const geom = (): SwipeGeometry => ({
      width: root.current?.offsetWidth ?? 0,
      leading: latest.current.leading ? ACTION_W : 0,
      trailing: Math.min(2, latest.current.trailing.length) * ACTION_W,
    });

    /** Сдвиг строки: число — пиксели, строка — например «-100%» (уехала целиком). */
    const setX = (x: number | string, animated: boolean) => {
      const el = root.current;
      if (!el) return;
      el.classList.toggle('is-dragging', !animated);
      el.style.setProperty('--x', typeof x === 'number' ? `${x}px` : x);
      if (typeof x === 'number') offset = x;
    };

    const setArmed = (on: boolean) => {
      if (on === armed) return;
      armed = on;
      root.current?.classList.toggle('is-armed', on);
    };

    function close() {
      window.clearTimeout(fallback);
      if (openRow === handle) openRow = null;
      setArmed(false);
      setX(0, true);
      root.current?.classList.remove('is-open');
    }

    function open(side: SwipeSide) {
      const g = geom();
      setArmed(false);
      setX(side === 'leading' ? g.leading : -g.trailing, true);
      root.current?.classList.add('is-open');
      setOpenRow(handle);
    }

    const edgeAction = (side: SwipeSide) => (side === 'leading' ? latest.current.leading : latest.current.trailing[0]);

    /** Выполнить действие: с подтверждением — после ответа в шторке. */
    async function run(action: SwipeAction) {
      if (action.confirm) {
        busy = true;
        if (openRow === handle) openRow = null;
        const ok = await askConfirm(action.confirm, latest.current.label);
        busy = false;
        if (!alive) return;
        if (!ok) {
          close();
          return;
        }
      }
      action.onAction();
      // Если строка после действия осталась (не удалилась из списка) — возвращаем её на место.
      window.setTimeout(() => alive && !busy && close(), 0);
    }

    /** Полный свайп: строка уезжает целиком, затем выполняется действие. */
    function full(side: SwipeSide) {
      const action = edgeAction(side);
      if (!action) return close();
      haptic('medium');
      busy = true;
      if (openRow === handle) openRow = null;
      setArmed(true);
      setX(side === 'leading' ? '100%' : '-100%', true);
      offset = 0;
      const done = () => {
        content.current?.removeEventListener('transitionend', onEnd);
        window.clearTimeout(fallback);
        busy = false;
        if (alive) void run(action);
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target === content.current && e.propertyName === 'transform') done();
      };
      content.current?.addEventListener('transitionend', onEnd);
      fallback = window.setTimeout(done, 600);
    }

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      gesture = null;
    };

    function onMove(e: PointerEvent) {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      if (!g.axis) {
        const dx = e.clientX - g.x0;
        const dy = e.clientY - g.y0;
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        // Вертикально — это прокрутка списка, не наш жест.
        if (Math.abs(dy) >= Math.abs(dx)) {
          detach();
          return;
        }
        g.axis = 'x';
        g.x0 = e.clientX; // отсчёт от точки захвата: строка не «прыгает» на 10 px
        g.geom = geom();
        suppressClick = true;
        try {
          root.current?.setPointerCapture(e.pointerId);
        } catch {
          // Захват не обязателен: события всё равно слушаем на window.
        }
      }
      const x = clampOffset(g.base + e.clientX - g.x0, g.geom);
      setX(x, false);
      setArmed(isArmed(x, g.geom));
      const now = performance.now();
      g.samples.push({ x: e.clientX, t: now });
      while (g.samples.length > 2 && now - g.samples[0].t > VELOCITY_WINDOW) g.samples.shift();
    }

    function onUp(e: PointerEvent) {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      detach();
      if (!g.axis) {
        // Касание открытой строки (не по кнопке действия) — только закрыть её.
        if (offset !== 0 && !(e.target as Element | null)?.closest?.('.swipe-action')) {
          suppressClick = true;
          close();
        }
        return;
      }
      const first = g.samples[0];
      const last = g.samples[g.samples.length - 1];
      const velocity = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      settle(releaseOutcome(offset, velocity, g.geom));
    }

    function onCancel(e: PointerEvent) {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      detach();
      if (g.axis) settle(releaseOutcome(offset, 0, g.geom));
    }

    function settle(out: SwipeOutcome) {
      if (out.kind === 'full') full(out.side);
      else if (out.kind === 'open') open(out.side);
      else close();
    }

    return {
      onPointerDown(e: PointerEvent) {
        if (e.button !== 0 || busy || gesture) return;
        suppressClick = false;
        gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null, base: offset, geom: geom(), samples: [] };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      },
      onClickCapture(e: MouseEvent) {
        if (suppressClick || performance.now() < swallowClickUntil) {
          e.preventDefault();
          e.stopPropagation();
          suppressClick = false;
          swallowClickUntil = 0;
        }
      },
      /** Tab на кнопку действия открывает строку с её стороны, возврат к содержимому — закрывает. */
      onFocusIn(e: FocusEvent) {
        if (busy) return;
        const layer = (e.target as Element).closest('.swipe-row__actions');
        if (layer) {
          const side: SwipeSide = layer.classList.contains('swipe-row__actions--leading') ? 'leading' : 'trailing';
          if ((side === 'leading' && offset <= 0) || (side === 'trailing' && offset >= 0)) open(side);
        } else if (offset !== 0 && !gesture) {
          close();
        }
      },
      onFocusOut(e: FocusEvent) {
        const next = e.relatedTarget as Node | null;
        if (!busy && offset !== 0 && next && !root.current?.contains(next)) close();
      },
      onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape' && offset !== 0 && !busy) {
          e.stopPropagation();
          close();
        }
      },
      tap(action: SwipeAction) {
        if (busy) return;
        if (!action.confirm) close();
        void run(action);
      },
      unmount() {
        alive = false;
        detach();
        window.clearTimeout(fallback);
        if (openRow === handle) openRow = null;
      },
    };
  }, []);

  useEffect(() => () => ctl.unmount(), []);

  const shown = trailing.slice(0, 2);
  // Справа кнопки идут от строки к краю: [второе][первое — крайнее].
  const trailingVisual = shown.slice().reverse();
  const cover = -(shown.length - 1) * ACTION_W;

  return (
    <div
      ref={root}
      class="swipe-row"
      role="group"
      aria-label={label}
      onPointerDown={ctl.onPointerDown}
      onClickCapture={ctl.onClickCapture}
      onFocusIn={ctl.onFocusIn}
      onFocusOut={ctl.onFocusOut}
      onKeyDown={ctl.onKeyDown}
    >
      <div ref={content} class="swipe-row__content">
        {children}
      </div>
      {leading && (
        <div class="swipe-row__actions swipe-row__actions--leading" style={`--edge-bg:${TONES[leading.tone]}`}>
          <ActionButton action={leading} edge onPress={ctl.tap} />
        </div>
      )}
      {shown.length > 0 && (
        <div class="swipe-row__actions swipe-row__actions--trailing" style={`--edge-bg:${TONES[shown[0].tone]}`}>
          {trailingVisual.map((a) => (
            <ActionButton key={a.id} action={a} edge={a === shown[0]} cover={cover} onPress={ctl.tap} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton(props: { action: SwipeAction; edge?: boolean; cover?: number; onPress: (a: SwipeAction) => void }) {
  const { action, edge, cover } = props;
  const style = [`--tone:${TONES[action.tone]}`];
  if (edge && cover) style.push(`--cover:${cover}px`);
  return (
    <button
      type="button"
      class={`swipe-action${edge ? ' swipe-action--edge' : ''}`}
      style={style.join(';')}
      onClick={() => props.onPress(action)}
    >
      <span class="swipe-action__inner">
        <Icon name={action.icon} weight="fill" size={22} class="swipe-action__icon" />
        <span class="swipe-action__label">{action.label}</span>
      </span>
    </button>
  );
}
