// Экран в стиле iOS: большой заголовок, который при прокрутке сжимается
// в маленький заголовок в стеклянной верхней панели.

import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import './Screen.css';

interface Props {
  title: string;
  /** Над большим заголовком: например приветствие и дата. */
  above?: ComponentChildren;
  /** Под большим заголовком мелким шрифтом. */
  subtitle?: ComponentChildren;
  /** Кнопки справа в верхней панели (видны всегда). */
  trailing?: ComponentChildren;
  /** Кнопка «‹ Назад» слева (для вложенных экранов). */
  back?: { label: string; onBack: () => void };
  children: ComponentChildren;
  class?: string;
}

export function Screen({ title, above, subtitle, trailing, back, children, class: cls }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const barEnd = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Размер верхней панели: высота меняется с вырезом экрана и раскладкой, ширина — с поворотом и меню.
  const [barSize, setBarSize] = useState({ w: 0, h: 0 });
  // Подпись «назад» не помещается — пишем «Назад», как в iOS, а не обрезанное «Настр…».
  const [shortBack, setShortBack] = useState(false);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.offsetHeight;
      setBarSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Маленький заголовок появляется, когда большой целиком ушёл под верхнюю панель.
  useEffect(() => {
    const root = scroller.current;
    const el = titleRef.current;
    if (!root || !el || !bar.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      root,
      rootMargin: `-${bar.current.offsetHeight}px 0px 0px 0px`,
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [barSize.h]);

  // Сначала пробуем полную подпись, затем проверяем, не вытолкнули ли колонки панели правый край за поля.
  useLayoutEffect(() => setShortBack(false), [back?.label, collapsed, barSize.w]);
  useLayoutEffect(() => {
    const el = bar.current;
    const end = barEnd.current;
    if (!back || shortBack || !el || !end) return;
    const limit = el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).paddingRight);
    if (end.getBoundingClientRect().right > limit + 0.5) setShortBack(true);
  });

  return (
    <div ref={scroller} class={`screen${cls ? ` ${cls}` : ''}`} data-screen-scroller>
      <header ref={bar} class={`navbar${collapsed ? ' is-collapsed' : ''}`}>
        <div class="navbar__bg glass" aria-hidden="true" />
        <div class="navbar__side">
          {back && (
            <button
              class="navbar__back pressable-dim"
              aria-label={shortBack ? `Назад: ${back.label}` : undefined}
              onClick={back.onBack}
            >
              <Icon name="caret-left" size={22} weight="regular" />
              <span>{shortBack ? 'Назад' : back.label}</span>
            </button>
          )}
        </div>
        <div class="navbar__title t-headline" aria-hidden={!collapsed}>
          {title}
        </div>
        <div ref={barEnd} class="navbar__side navbar__side--end">
          {trailing}
        </div>
      </header>
      <div class="screen__head">
        {above}
        <h1 ref={titleRef} class="t-large-title screen__title">
          {title}
        </h1>
        {subtitle && <p class="screen__subtitle t-subhead t-secondary">{subtitle}</p>}
      </div>
      <div class="screen__body">{children}</div>
    </div>
  );
}
