import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import {
  closeContextMenu, closeSheet, dismissToast, useOverlayState,
  type ContextMenuSpec, type SheetSpec, type ToastSpec,
} from './overlays';
import './overlays.css';

/** Рисует шторки, контекстное меню и уведомления. Ставится один раз в корне приложения. */
export function OverlayHost() {
  const { sheets, menu, toasts } = useOverlayState();
  return (
    <>
      {sheets.map((s, i) => (
        <Sheet key={s.id} spec={s} depth={sheets.length - 1 - i} />
      ))}
      {menu && <ContextMenu spec={menu} />}
      <div class="toasts" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} spec={t} />
        ))}
      </div>
    </>
  );
}

const DURATION = 450;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Шторка снизу с «ручкой». Закрывается свайпом вниз, тапом по фону или клавишей Esc. */
function Sheet({ spec, depth }: { spec: SheetSpec; depth: number }) {
  const [phase, setPhase] = useState<'enter' | 'open' | 'leave'>('enter');
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number; t: number } | null>(null);
  const lastFocus = useRef<Element | null>(null);

  const close = () => {
    if (phase === 'leave') return;
    setPhase('leave');
    window.setTimeout(() => closeSheet(spec.id), reducedMotion() ? 0 : DURATION);
  };

  useEffect(() => {
    lastFocus.current = document.activeElement;
    const raf = requestAnimationFrame(() => setPhase('open'));
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && depth === 0 && close();
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      (lastFocus.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    const body = panel.current?.querySelector('.sheet__body');
    const fromHandle = (e.target as HTMLElement).closest('.sheet__top');
    if (!fromHandle && body && body.scrollTop > 0) return;
    drag.current = { y: e.clientY, dy: 0, t: performance.now() };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !panel.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    if (dy > 4) {
      panel.current.style.transition = 'none';
      panel.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    panel.current.style.transition = '';
    panel.current.style.transform = '';
    const velocity = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > 120 || (d.dy > 40 && velocity > 0.5)) close();
  };

  return (
    <div class={`sheet-layer is-${phase}`} style={`--depth:${depth}`}>
      <div class="sheet-backdrop" onClick={close} />
      <div
        ref={panel}
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={spec.title ?? spec.label}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div class="sheet__top">
          <span class="sheet__grabber" aria-hidden="true" />
          <div class="sheet__titlebar">
            {spec.title && <h2 class="t-headline sheet__title">{spec.title}</h2>}
            <button class="sheet__close pressable" onClick={close} aria-label="Закрыть">
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>
        <div class="sheet__body">{spec.content()}</div>
      </div>
    </div>
  );
}

/** Контекстное меню по долгому нажатию: фон размывается, элемент приподнимается, под ним меню. */
function ContextMenu({ spec }: { spec: ContextMenuSpec }) {
  const [phase, setPhase] = useState<'enter' | 'open' | 'leave'>('enter');
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuHeight, setMenuHeight] = useState(0);

  const close = () => {
    if (phase === 'leave') return;
    setPhase('leave');
    window.setTimeout(closeContextMenu, reducedMotion() ? 0 : 250);
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('open'));
    setMenuHeight(menuRef.current?.offsetHeight ?? 0);
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, []);

  const { rect } = spec;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const gap = 10;
  const menuWidth = Math.min(260, vw - 32);
  // Меню под элементом; если не помещается — над ним; если и так тесно — элемент сдвигается вверх.
  const fitsBelow = rect.top + rect.height + gap + menuHeight + 16 <= vh;
  const shift = fitsBelow ? 0 : Math.min(0, vh - 16 - menuHeight - gap - rect.height - rect.top);
  const previewTop = Math.max(16, rect.top + shift);
  const menuTop = previewTop + rect.height + gap;
  const menuLeft = Math.min(Math.max(16, rect.left), vw - menuWidth - 16);

  return (
    <div class={`ctx-layer is-${phase}`} onClick={close} role="presentation">
      <div class="ctx-backdrop" />
      <div class="ctx-preview" style={`top:${previewTop}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px`} aria-hidden="true">
        {spec.preview()}
      </div>
      <div
        ref={menuRef}
        class="ctx-menu"
        role="menu"
        style={`top:${menuTop}px;left:${menuLeft}px;width:${menuWidth}px`}
        onClick={(e) => e.stopPropagation()}
      >
        {spec.items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            class={`ctx-menu__item${item.destructive ? ' is-destructive' : ''}`}
            onClick={() => {
              close();
              item.onSelect();
            }}
          >
            <span>{item.label}</span>
            <Icon name={item.icon} size={20} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Небольшое уведомление снизу. Само исчезает через 3–4 секунды. */
function Toast({ spec }: { spec: ToastSpec }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!spec.duration) return;
    const t1 = window.setTimeout(() => setLeaving(true), spec.duration);
    const t2 = window.setTimeout(() => dismissToast(spec.id), spec.duration + 300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [spec.id]);
  return (
    <div class={`toast glass${leaving ? ' is-leaving' : ''}`} role="status">
      {spec.icon && <Icon name={spec.icon} weight="fill" size={20} class="toast__icon" />}
      <span class="toast__text t-subhead">{spec.text}</span>
      {spec.actionLabel && (
        <button
          class="toast__action pressable-dim"
          onClick={() => {
            spec.onAction?.();
            dismissToast(spec.id);
          }}
        >
          {spec.actionLabel}
        </button>
      )}
    </div>
  );
}
