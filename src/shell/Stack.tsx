// Стек экранов как в iOS: вложенный экран въезжает справа, «назад» — обратно
// (кнопкой или свайпом от левого края). Нижние экраны остаются живыми — сохраняется прокрутка.

import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { routeChain, routeKey, type Route } from './nav';

export interface BackInfo {
  label: string;
  onBack: () => void;
}

interface Props {
  route: Route;
  settingsOverToday: boolean;
  render: (route: Route, back: BackInfo | undefined) => ComponentChildren;
  /** Подпись кнопки «назад» для экрана-родителя. */
  titleOf: (route: Route) => string;
  onBack: (parent: Route) => void;
}

/** При «назад» уходящий экран ещё виден — помним цепочку, в которой он был, чтобы дать ему его же кнопку «‹». */
type Anim = { kind: 'push' } | { kind: 'pop'; exiting: Route; chain: Route[] } | null;

const DURATION = 460;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Stack({ route, settingsOverToday, render, titleOf, onBack }: Props) {
  const chain = routeChain(route, settingsOverToday);
  const keys = chain.map(routeKey).join('|');
  const prev = useRef<{ keys: string; chain: Route[] }>({ keys, chain });
  const anim = useRef<Anim>(null);
  const skipNext = useRef(false);
  const [, rerender] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  // Определяем направление перехода прямо во время отрисовки, чтобы не было кадра без анимации.
  if (prev.current.keys !== keys) {
    const before = prev.current.chain.map(routeKey);
    const after = chain.map(routeKey);
    const isPush = after.length > before.length && before.every((k, i) => after[i] === k);
    const isPop = after.length < before.length && after.every((k, i) => before[i] === k);
    if (skipNext.current || reducedMotion()) anim.current = null;
    else if (isPush) anim.current = { kind: 'push' };
    else if (isPop) anim.current = { kind: 'pop', exiting: prev.current.chain[prev.current.chain.length - 1], chain: prev.current.chain };
    else anim.current = null;
    skipNext.current = false;
    prev.current = { keys, chain };
  }

  useEffect(() => {
    if (!anim.current) return;
    const t = window.setTimeout(() => {
      anim.current = null;
      rerender((n) => n + 1);
    }, DURATION);
    return () => window.clearTimeout(t);
  }, [keys]);

  const backFor = (layers: Route[], i: number): BackInfo | undefined => {
    if (i === 0) return undefined;
    const parent = layers[i - 1];
    return { label: titleOf(parent), onBack: () => onBack(parent) };
  };

  // ---------- Свайп от левого края ----------
  const drag = useRef<{ x0: number; t0: number; dx: number } | null>(null);
  // После свайпа слои стоят там, куда их дотянули, пока не сменится экран: history.back() срабатывает
  // не сразу, и без этого верхний экран на кадр вернулся бы на место.
  const swiped = useRef<HTMLElement[]>([]);
  const clearSwipe = () => {
    for (const el of swiped.current) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.visibility = '';
    }
    swiped.current = [];
  };
  useLayoutEffect(clearSwipe, [keys]);
  const layersEls = () => {
    const els = container.current?.querySelectorAll<HTMLElement>(':scope > .stack__layer:not(.is-exiting)');
    return els ? [els[els.length - 2], els[els.length - 1]] : [undefined, undefined];
  };
  const onEdgeDown = (e: PointerEvent) => {
    drag.current = { x0: e.clientX, t0: performance.now(), dx: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onEdgeMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const width = container.current?.clientWidth ?? 1;
    const dx = Math.max(0, Math.min(width, e.clientX - drag.current.x0));
    drag.current.dx = dx;
    const [below, top] = layersEls();
    if (top) {
      top.style.transition = 'none';
      top.style.transform = `translateX(${dx}px)`;
    }
    if (below) {
      below.style.transition = 'none';
      below.style.visibility = 'visible';
      below.style.transform = `translateX(${-28 + (dx / width) * 28}%)`;
    }
  };
  const onEdgeUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const width = container.current?.clientWidth ?? 1;
    const velocity = d.dx / Math.max(1, performance.now() - d.t0);
    const commit = d.dx > width * 0.35 || (d.dx > 30 && velocity > 0.5);
    const [below, top] = layersEls();
    const ease = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
    if (top) {
      top.style.transition = ease;
      top.style.transform = commit ? 'translateX(100%)' : '';
    }
    if (below) {
      below.style.transition = ease;
      below.style.transform = commit ? 'translateX(0)' : '';
    }
    window.setTimeout(() => {
      swiped.current = [top, below].filter((el): el is HTMLElement => !!el);
      if (!commit) return clearSwipe();
      skipNext.current = true;
      onBack(chain[chain.length - 2]);
      // Если экран так и не сменился — вернуть слои на место, а не оставить пустоту.
      window.setTimeout(() => {
        if (!swiped.current.length) return;
        skipNext.current = false;
        clearSwipe();
      }, 1000);
    }, 300);
  };

  const a = anim.current;
  // Все слои — одним списком с ключами: уходящий экран остаётся тем же (прокрутка, кнопка «‹»), а не создаётся заново.
  const layers = chain.map((r, i) => ({ route: r, back: backFor(chain, i), exiting: false }));
  if (a?.kind === 'pop') layers.push({ route: a.exiting, back: backFor(a.chain, a.chain.length - 1), exiting: true });
  return (
    <div class="stack" ref={container}>
      {layers.map(({ route: r, back, exiting }, i) => {
        const isTop = i === chain.length - 1;
        const classes = ['stack__layer'];
        if (exiting) classes.push('is-exiting', 'anim-pop-out');
        else classes.push(isTop ? 'is-top' : 'is-below');
        if (a?.kind === 'push' && isTop) classes.push('anim-push-in');
        if (a?.kind === 'push' && i === chain.length - 2) classes.push('anim-push-cover');
        if (a?.kind === 'pop' && isTop) classes.push('anim-pop-reveal');
        return (
          <div key={routeKey(r)} class={classes.join(' ')} aria-hidden={isTop ? undefined : 'true'}>
            {render(r, back)}
          </div>
        );
      })}
      {chain.length > 1 && (
        <div
          class="stack__edge"
          onPointerDown={onEdgeDown}
          onPointerMove={onEdgeMove}
          onPointerUp={onEdgeUp}
          onPointerCancel={onEdgeUp}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
