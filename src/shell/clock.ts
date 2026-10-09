// Источник времени: настоящие московские часы или «тестовые» (превью, ?now=…), которые тоже идут.

import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { moscowClock, parseClockOverride, shiftClock, type Clock } from '../core/time';

export interface ClockSource {
  now(): Clock;
  /** Часы не настоящие (показываем пометку «тестовое время»). */
  simulated: boolean;
}

export const realClock: ClockSource = { now: () => moscowClock(), simulated: false };

/** Часы, которые стартуют с заданного момента и идут дальше в реальном темпе. */
export function startedClock(start: Clock): ClockSource {
  const t0 = Date.now();
  return { now: () => shiftClock(start, (Date.now() - t0) / 1000), simulated: true };
}

/** ?now=2026-10-12T10:17 в адресе страницы — тестовое время. */
export function clockFromUrl(): ClockSource {
  const start = typeof location === 'undefined' ? null : parseClockOverride(new URLSearchParams(location.search).get('now'));
  return start ? startedClock(start) : realClock;
}

export const ClockContext = createContext<ClockSource>(realClock);

/**
 * Текущее время. 'second' — обновление раз в секунду (таймеры), 'minute' — раз в 15 секунд.
 * Пока приложение не видно на экране, таймер стоит (экономия батареи).
 */
export function useClock(precision: 'second' | 'minute' = 'minute'): Clock {
  const source = useContext(ClockContext);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    const interval = precision === 'second' ? 1000 : 15_000;
    const start = () => {
      window.clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      setTick((t) => t + 1);
      timer = window.setInterval(() => setTick((t) => t + 1), interval);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', start);
    };
  }, [precision, source]);

  const clock = source.now();
  const key = precision === 'second' ? `${clock.date} ${clock.seconds}` : `${clock.date} ${clock.minutes}`;
  // Новый объект — только когда время на часах изменилось (tick лишь будит перерисовку).
  void tick;
  return useMemo(() => clock, [key]);
}
