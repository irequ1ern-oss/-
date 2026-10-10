import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import {
  closeContextMenu, closeSheet, dismissToast, useOverlayState,
  type ContextMenuSpec, type SheetSpec, type ToastSpec,
} from './overlays';
import './overlays.css';

/** Рисует шторки, контекстное меню и уведомления. Ставится один раз в корне приложения. */
export function OverlayHost() {
  const { sheets, menu, toasts } = useOverlayState();
  const anchor = useRef<HTMLDivElement>(null);
  useInertBackground(sheets.length > 0 || menu !== null, anchor);
  return (
    <>
      {sheets.map((s, i) => (
        <Sheet key={s.id} spec={s} depth={sheets.length - 1 - i} covered={menu !== null} />
      ))}
      {menu && <ContextMenu spec={menu} />}
      <div ref={anchor} class="toasts" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} spec={t} />
        ))}
      </div>
    </>
  );
}

const DURATION = 450;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Пока открыта шторка или меню, всё остальное на странице «неживое» (inert): Tab не уходит
 * под затемнение, экранный диктор не читает фон. Идём от слоя оверлеев вверх до <body> и
 * помечаем соседей на каждом уровне — так работает и в приложении, и на странице превью.
 * useLayoutEffect: фон оживает в том же кадре, что закрылся слой, и фокус можно вернуть сразу.
 */
function useInertBackground(active: boolean, anchor: { current: HTMLElement | null }) {
  useLayoutEffect(() => {
    if (!active || !anchor.current) return;
    const marked: Element[] = [];
    for (let node: Element = anchor.current; node !== document.body && node.parentElement; node = node.parentElement) {
      for (const el of Array.from(node.parentElement.children)) {
        if (el === node || el.hasAttribute('inert') || el.matches('.sheet-layer, .ctx-layer, script, style, link')) continue;
        el.setAttribute('inert', '');
        marked.push(el);
      }
    }
    return () => marked.forEach((el) => el.removeAttribute('inert'));
  }, [active]);
}

/** Кто открыл последнее контекстное меню: шторка, открытая пунктом меню, вернёт фокус туда. */
let menuOpener: Element | null = null;

/** Элемент в фокусе в момент открытия слоя (пункт меню заменяем на то, что открыло меню). */
function currentOpener(): Element | null {
  const el = document.activeElement;
  return el?.closest('.ctx-layer') ? menuOpener : el;
}

/** Возвращает фокус на элемент, который открыл слой, — когда фон уже снова доступен. */
function restoreFocus(el: Element | null) {
  window.setTimeout(() => {
    const now = document.activeElement;
    // Фокус уже кто-то забрал (например, открылась следующая шторка) — не мешаем.
    if (now && now !== document.body) return;
    if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
  }, 0);
}

interface Drag {
  id: number;
  x: number;
  y: number;
  dy: number;
  t: number;
  /** pending — палец только коснулся, ещё не ясно, тянут шторку или прокручивают содержимое. */
  mode: 'pending' | 'drag';
}

/** Шторка снизу с «ручкой». Закрывается свайпом вниз, тапом по фону или клавишей Esc. */
function Sheet({ spec, depth, covered }: { spec: SheetSpec; depth: number; covered: boolean }) {
  const [phase, setPhase] = useState<'enter' | 'open' | 'leave'>('enter');
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const leaving = useRef(false);
  // Кто открыл шторку: запоминаем при первой отрисовке, пока фон ещё не стал inert и не потерял фокус.
  const [opener] = useState(currentOpener);
  const depthRef = useRef(depth);
  depthRef.current = depth;

  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase('leave');
    window.setTimeout(() => closeSheet(spec.id), reducedMotion() ? 0 : DURATION);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Закрытие из кода (dismissSheet) — та же анимация, что у «×».
  useEffect(() => {
    if (spec.leaving) close();
  }, [spec.leaving]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('open'));
    panel.current?.focus({ preventScroll: true });
    // Esc закрывает только верхнюю шторку; если поверх открыто меню, Esc достаётся ему.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || depthRef.current !== 0) return;
      e.preventDefault();
      closeRef.current();
    };
    // Палец тянет вниз содержимое, прокрученное до верха: не даём браузеру начать прокрутку
    // (иначе он заберёт жест себе и пришлёт pointercancel) — тянем шторку.
    const onTouchMove = (e: TouchEvent) => {
      const d = drag.current;
      const t = e.touches[0];
      if (!d || !t || !e.cancelable) return;
      const dy = t.clientY - d.y;
      if (d.mode === 'drag' || (dy > 0 && Math.abs(t.clientX - d.x) < dy)) e.preventDefault();
    };
    const el = panel.current;
    window.addEventListener('keydown', onKey);
    el?.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      el?.removeEventListener('touchmove', onTouchMove);
      restoreFocus(opener);
    };
  }, []);

  /** Палец отпустили (commit) или жест отменили: шторка либо уезжает, либо возвращается на место. */
  const endDrag = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    const el = panel.current;
    if (!d || d.mode !== 'drag' || !el) return;
    el.style.transition = '';
    el.style.transform = '';
    const velocity = d.dy / Math.max(1, performance.now() - d.t);
    if (commit && (d.dy > 120 || (d.dy > 40 && velocity > 0.5))) close();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || leaving.current) return;
    const target = e.target as HTMLElement;
    // В поле ввода жест — это выделение текста, а не перетаскивание.
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    const body = panel.current?.querySelector('.sheet__body');
    const fromHandle = target.closest('.sheet__top');
    if (!fromHandle && body && body.scrollTop > 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dy: 0, t: performance.now(), mode: 'pending' };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const el = panel.current;
    if (!d || !el || e.pointerId !== d.id) return;
    // Кнопку мыши отпустили где-то за окном, и pointerup до нас не дошёл.
    if (e.pointerType === 'mouse' && e.buttons === 0) return endDrag(false);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === 'pending') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Вверх или вбок — это прокрутка содержимого, шторку не трогаем.
      if (dy <= 0 || Math.abs(dx) > dy) {
        drag.current = null;
        return;
      }
      d.mode = 'drag';
      d.t = performance.now();
      // Дальше все события этого пальца идут шторке, даже если он ушёл за её край.
      // (Касание и так «захвачено» элементом под пальцем; его lostpointercapture всплывает — см. ниже.)
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Указатель уже отпущен — ничего страшного, pointerup всё равно придёт.
      }
      el.style.transition = 'none';
    }
    d.dy = Math.max(0, dy);
    el.style.transform = `translateY(${d.dy}px)`;
  };

  return (
    <div class={`sheet-layer is-${phase}`} style={`--depth:${depth}`} inert={depth > 0 || covered}>
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
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        onLostPointerCapture={(e) => e.target === e.currentTarget && endDrag(false)}
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
  const leaving = useRef(false);
  const [opener] = useState(() => (menuOpener = document.activeElement));

  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase('leave');
    window.setTimeout(closeContextMenu, reducedMotion() ? 0 : 250);
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('open'));
    setMenuHeight(menuRef.current?.offsetHeight ?? 0);
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    // В фазе захвата и с preventDefault: шторка под меню видит, что Esc уже обработан.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      restoreFocus(opener);
    };
  }, []);

  /** Стрелки, Home и End переходят между пунктами (как положено role="menu"). */
  const onMenuKey = (e: KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('.ctx-menu__item') ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (e.key) {
      case 'ArrowDown':
        next = at < 0 || at === items.length - 1 ? 0 : at + 1;
        break;
      case 'ArrowUp':
        next = at <= 0 ? items.length - 1 : at - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    items[next].focus();
  };

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
        onKeyDown={onMenuKey}
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
