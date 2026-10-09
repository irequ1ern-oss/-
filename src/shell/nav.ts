// Навигация по адресу (#/week, #/settings/subjects/mss): работает кнопка и жест «Назад».

import { useEffect, useState } from 'preact/hooks';

export type TabId = 'today' | 'week' | 'homework' | 'notes' | 'settings';

export interface Route {
  tab: TabId;
  /** Вложенные экраны настроек: ['subjects'], ['subjects', 'mss'], ['schedule'], ['about']. */
  path: string[];
}

const TABS: TabId[] = ['today', 'week', 'homework', 'notes', 'settings'];

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const tab = TABS.includes(parts[0] as TabId) ? (parts[0] as TabId) : 'today';
  return { tab, path: tab === 'settings' ? parts.slice(1, 3) : [] };
}

export function routeToHash(route: Route): string {
  return `#/${[route.tab, ...route.path].map(encodeURIComponent).join('/')}`;
}

export function routeKey(route: Route): string {
  return [route.tab, ...route.path].join('/');
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeKey(a) === routeKey(b);
}

/**
 * Цепочка экранов от корня до текущего (для анимации «сдвиг справа» и жеста «назад»).
 * На телефоне настройки открываются поверх «Сегодня», на планшете — отдельный раздел.
 */
export function routeChain(route: Route, settingsOverToday: boolean): Route[] {
  if (route.tab !== 'settings') return [route];
  const chain: Route[] = settingsOverToday ? [{ tab: 'today', path: [] }] : [];
  for (let i = 0; i <= route.path.length; i++) chain.push({ tab: 'settings', path: route.path.slice(0, i) });
  return chain;
}

let current = typeof location === 'undefined' ? parseHash('') : parseHash(location.hash);
let pushedDepth = 0;
const listeners = new Set<(r: Route) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parseHash(location.hash);
    listeners.forEach((l) => l(current));
  });
}

export function useRoute(): Route {
  const [r, setR] = useState(current);
  useEffect(() => {
    listeners.add(setR);
    setR(current);
    return () => void listeners.delete(setR);
  }, []);
  return r;
}

export function navigate(route: Route, opts: { replace?: boolean } = {}) {
  if (sameRoute(route, current)) return;
  const hash = routeToHash(route);
  if (opts.replace) {
    history.replaceState(history.state, '', hash);
    current = route;
    listeners.forEach((l) => l(current));
  } else {
    pushedDepth++;
    location.hash = hash;
  }
}

/** «Назад»: по истории браузера, а если приложение открыли сразу на вложенном экране — на уровень выше. */
export function goBack(fallback: Route) {
  if (pushedDepth > 0) {
    pushedDepth--;
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}
