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
  const parts: string[] = [];
  for (const raw of hash.replace(/^#\/?/, '').split('/').filter(Boolean)) {
    try {
      parts.push(decodeURIComponent(raw));
    } catch {
      // Испорченный адрес (#/settings/%) — открываем главный экран, а не пустую страницу.
      return { tab: 'today', path: [] };
    }
  }
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

/**
 * Что лежит в history.state у записи, открытой через navigate(): экран, с которого сюда пришли.
 * Переживает перезагрузку и системные «назад/вперёд», в отличие от счётчика в памяти.
 */
interface NavState {
  prev?: string;
}

/**
 * «Назад» к родителю можно сделать шагом по истории, только если предыдущая запись — именно он.
 * Иначе (открыли сразу вложенный экран, перешли в «Предметы» из карточки на «Неделе»)
 * history.back() увёл бы не туда — тогда адрес просто заменяется на родителя.
 */
export function canGoBackInHistory(state: unknown, parent: Route): boolean {
  return typeof state === 'object' && state !== null && (state as NavState).prev === routeKey(parent);
}

let current = typeof location === 'undefined' ? parseHash('') : parseHash(location.hash);
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
    // Запись остаётся той же, поэтому и «откуда пришли» в ней не меняется.
    history.replaceState(history.state, '', hash);
    current = route;
    listeners.forEach((l) => l(current));
  } else {
    const state: NavState = { prev: routeKey(current) };
    // Смена hash сразу добавляет запись в историю — дописываем в неё, откуда пришли.
    location.hash = hash;
    history.replaceState(state, '');
  }
}

/** «Назад» к экрану-родителю: шагом по истории, если пришли с него, иначе — заменой адреса. */
export function goBack(parent: Route) {
  if (sameRoute(parent, current)) return;
  if (canGoBackInHistory(history.state, parent)) history.back();
  else navigate(parent, { replace: true });
}
