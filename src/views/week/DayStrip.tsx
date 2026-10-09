// Полоса дней недели: капсула на каждый день (Пн + число), под ней точки изменений и ДЗ.
// Работает как вкладки: стрелки ← → на клавиатуре листают дни (и недели на краю).

import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { ResolvedDay } from '../../core/schedule';
import { weekdayShort } from '../../core/format';
import type { DateStr } from '../../core/time';
import type { HomeworkItem } from '../../shell/app';
import { dayMarks, dayPillLabel } from './weekLogic';

interface Props {
  days: ResolvedDay[];
  selected: DateStr;
  today: DateStr;
  homework: HomeworkItem[];
  onSelect: (date: DateStr) => void;
  /** Соседний день с клавиатуры (на краю недели — соседняя неделя). */
  onStep: (dir: 1 | -1) => void;
}

export const PANEL_ID = 'week-day-panel';
export const tabId = (date: DateStr) => `week-tab-${date}`;

export function DayStrip({ days, selected, today, homework, onSelect, onStep }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const week = days[0].date;
  const lastWeek = useRef(week);

  // Сменилась неделя — полоса въезжает с той стороны, куда листали.
  useLayoutEffect(() => {
    const from = lastWeek.current;
    lastWeek.current = week;
    const el = root.current;
    if (from === week || !el?.animate) return;
    const css = getComputedStyle(el);
    const dir = week > from ? 1 : -1;
    el.animate(
      [
        { opacity: 0, transform: `translateX(${dir * 24}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: parseFloat(css.getPropertyValue('--dur-2')) || 320, easing: css.getPropertyValue('--ease-ios').trim() || 'ease-out' },
    );
  }, [week]);

  // После листания с клавиатуры фокус переходит на новый выбранный день (даже в другой неделе).
  useEffect(() => {
    if (!keyboard.current) return;
    keyboard.current = false;
    root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, [selected]);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      e.preventDefault();
      keyboard.current = true;
      onStep(step);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      keyboard.current = true;
      onSelect(days[e.key === 'Home' ? 0 : days.length - 1].date);
    }
  };

  return (
    <div
      ref={root}
      class={`week-strip${days.length > 5 ? ' week-strip--dense' : ''}`}
      role="tablist"
      aria-label="Дни недели"
      style={`--n:${days.length}`}
      onKeyDown={onKeyDown}
    >
      {days.map((day) => {
        const marks = dayMarks(day, homework);
        const isSelected = day.date === selected;
        const classes = ['day-pill', 'pressable'];
        if (isSelected) classes.push('is-selected');
        if (day.date === today) classes.push('is-today');
        return (
          <button
            key={day.date}
            id={tabId(day.date)}
            class={classes.join(' ')}
            role="tab"
            aria-selected={isSelected}
            aria-controls={PANEL_ID}
            aria-label={dayPillLabel(day, today, marks)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(day.date)}
          >
            <span class="day-pill__box">
              <span class="day-pill__wd">{weekdayShort(day.date)}</span>
              <span class="day-pill__num tabular">{Number(day.date.slice(8, 10))}</span>
            </span>
            <span class="day-pill__dots" aria-hidden="true">
              {marks.changes && <span class="day-pill__dot day-pill__dot--changes" />}
              {marks.homework > 0 && <span class="day-pill__dot day-pill__dot--homework" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
