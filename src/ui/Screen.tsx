// Экран в стиле iOS: большой заголовок, который при прокрутке сжимается
// в маленький заголовок в стеклянной верхней панели.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const root = scroller.current;
    const el = titleRef.current;
    if (!root || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      root,
      rootMargin: '-52px 0px 0px 0px',
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={scroller} class={`screen${cls ? ` ${cls}` : ''}`} data-screen-scroller>
      <header class={`navbar${collapsed ? ' is-collapsed' : ''}`}>
        <div class="navbar__bg glass" aria-hidden="true" />
        <div class="navbar__side">
          {back && (
            <button class="navbar__back pressable-dim" onClick={back.onBack}>
              <Icon name="caret-left" size={22} weight="regular" />
              <span>{back.label}</span>
            </button>
          )}
        </div>
        <div class="navbar__title t-headline" aria-hidden={!collapsed}>
          {title}
        </div>
        <div class="navbar__side navbar__side--end">{trailing}</div>
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
