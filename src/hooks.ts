import { useEffect, useMemo, useState } from 'preact/hooks';
import { moscowClock, parseClockOverride, type Clock } from './core/time';

/** Тестовое время из адреса страницы (?now=2026-10-12T09:30), если задано. */
export const clockOverride: Clock | null =
  typeof location === 'undefined' ? null : parseClockOverride(new URLSearchParams(location.search).get('now'));

/** Московское время, обновляется каждые 15 секунд и при возвращении в приложение. */
export function useClock(): Clock {
  const [instant, setInstant] = useState(() => Date.now());

  useEffect(() => {
    if (clockOverride) return;
    const tick = () => setInstant(Date.now());
    const timer = setInterval(tick, 15_000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const clock = useMemo(() => moscowClock(new Date(instant)), [instant]);
  const minuteKey = `${clock.date} ${clock.minutes}`;
  // Новый объект только при смене минуты, чтобы экраны не пересчитывались зря.
  return useMemo(() => clockOverride ?? clock, [minuteKey]);
}

export type Route = 'today' | 'week' | 'homework' | 'notes' | 'more';
const ROUTES: Route[] = ['today', 'week', 'homework', 'notes', 'more'];

function readRoute(): Route {
  const name = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(name) ? name : 'today';
}

/** Текущий экран берётся из адреса (#/week), поэтому работает кнопка «Назад». */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route) => {
    if (r !== route) location.hash = `/${r}`;
  };
  return [route, go];
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
