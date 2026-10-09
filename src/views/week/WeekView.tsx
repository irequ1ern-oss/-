// Экран «Неделя» (раскладка W2): полоса дней сверху, под ней пары выбранного дня.
// Дни листаются свайпом по списку пар или нажатием на день; ‹ › в верхней панели — соседние недели.

import { useMemo, useRef, useState } from 'preact/hooks';
import { resolveDay } from '../../core/schedule';
import { defaultStripDay, shiftStripDay, weekDays } from '../../core/week';
import { formatWeekRange } from '../../core/format';
import { startOfWeek, type DateStr } from '../../core/time';
import { useAppData } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { Screen } from '../../ui/Screen';
import { Button, IconButton } from '../../ui/controls';
import { haptic } from '../../ui/haptics';
import { DayPager, reducedMotion, type PendingMove } from './DayPager';
import { DayPanel } from './DayPanel';
import { DayStrip, PANEL_ID, tabId } from './DayStrip';
import { directionTo, sameWeekdayIn, weekCaption, weekOffset } from './weekLogic';
import './week.css';

/**
 * Выбранный день живёт, пока открыто приложение: ушли на другую вкладку и вернулись — тот же день.
 * На следующий день (по часам) снова открывается день по умолчанию.
 */
let remembered: { date: DateStr; today: DateStr } | null = null;

export function WeekView() {
  const clock = useClock('minute');
  const { src, homework } = useAppData();
  const defaultDay = useMemo(() => defaultStripDay(clock.date, src), [clock.date, src]);
  const [selected, setSelected] = useState<DateStr>(() =>
    remembered && remembered.today === clock.date ? remembered.date : defaultDay,
  );
  const [pending, setPending] = useState<PendingMove | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // Пока идёт анимация, полоса дней и заголовок уже показывают новый день.
  const shown = pending?.date ?? selected;
  const monday = startOfWeek(shown);
  const days = useMemo(() => weekDays(monday, src), [monday, src]);
  const prev = pending?.dir === -1 ? pending.date : shiftStripDay(selected, -1, src);
  const next = pending?.dir === 1 ? pending.date : shiftStripDay(selected, 1, src);

  const go = (date: DateStr) => {
    if (date === shown) return;
    remembered = { date, today: clock.date };
    // Без анимации: «уменьшить движение» или новый выбор посреди перехода.
    if (pending || reducedMotion()) {
      setPending(null);
      setSelected(date);
      return;
    }
    setPending({ date, dir: directionTo(shown, date) });
  };

  const onSwipe = (dir: 1 | -1) => {
    haptic();
    go(shiftStripDay(selected, dir, src));
  };

  const onSettled = () => {
    const p = pendingRef.current;
    if (!p) return;
    setSelected(p.date);
    setPending(null);
  };

  return (
    <Screen
      class="week-screen"
      title={formatWeekRange(monday)}
      above={<p class="week-above t-footnote t-upper t-secondary">{weekCaption(weekOffset(clock.date, shown))}</p>}
      trailing={
        <div class="week-nav">
          {shown !== defaultDay && (
            <Button variant="plain" class="week-nav__today glass" onClick={() => go(defaultDay)}>
              Сегодня
            </Button>
          )}
          <div class="week-nav__arrows glass">
            <IconButton
              icon="caret-left"
              label="Предыдущая неделя"
              variant="plain"
              class="week-nav__arrow"
              onClick={() => go(sameWeekdayIn(shown, -1, src))}
            />
            <IconButton
              icon="caret-right"
              label="Следующая неделя"
              variant="plain"
              class="week-nav__arrow"
              onClick={() => go(sameWeekdayIn(shown, 1, src))}
            />
          </div>
        </div>
      }
    >
      <div class="week">
        <DayStrip
          days={days}
          selected={shown}
          today={clock.date}
          homework={homework}
          onSelect={go}
          onStep={(dir) => go(shiftStripDay(shown, dir, src))}
        />
        <DayPager
          selected={selected}
          prev={prev}
          next={next}
          pending={pending}
          panelId={PANEL_ID}
          labelledBy={tabId(shown)}
          renderDay={(date) => <DayPanel day={resolveDay(date, src)} clock={clock} homework={homework} />}
          onSwipe={onSwipe}
          onSettled={onSettled}
        />
      </div>
    </Screen>
  );
}
