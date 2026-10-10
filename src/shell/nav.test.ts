import { afterEach, describe, expect, it, vi } from 'vitest';
import { canGoBackInHistory, parseHash, routeChain, routeToHash, type Route } from './nav';

describe('навигация', () => {
  it('разбирает и собирает адрес', () => {
    expect(parseHash('#/week')).toEqual({ tab: 'week', path: [] });
    expect(parseHash('#/settings/subjects/mss')).toEqual({ tab: 'settings', path: ['subjects', 'mss'] });
    expect(parseHash('')).toEqual({ tab: 'today', path: [] });
    expect(parseHash('#/непонятно')).toEqual({ tab: 'today', path: [] });
    expect(routeToHash({ tab: 'settings', path: ['subjects', 'mdk0401'] })).toBe('#/settings/subjects/mdk0401');
  });

  it('испорченный адрес открывает главный экран, а не падает', () => {
    expect(parseHash('#/settings/%')).toEqual({ tab: 'today', path: [] });
    expect(parseHash('#/settings/subjects/%E0%A4%A')).toEqual({ tab: 'today', path: [] });
    expect(parseHash('#/settings/subjects/%D0%B0')).toEqual({ tab: 'settings', path: ['subjects', 'а'] });
  });

  it('на телефоне настройки лежат поверх «Сегодня»', () => {
    const r = { tab: 'settings' as const, path: ['subjects', 'mss'] };
    expect(routeChain(r, true).map((x) => [x.tab, ...x.path].join('/'))).toEqual([
      'today', 'settings', 'settings/subjects', 'settings/subjects/mss',
    ]);
    expect(routeChain(r, false)).toHaveLength(3);
    expect(routeChain({ tab: 'week', path: [] }, true)).toHaveLength(1);
  });
});

const SETTINGS: Route = { tab: 'settings', path: [] };
const SUBJECTS: Route = { tab: 'settings', path: ['subjects'] };
const MSS: Route = { tab: 'settings', path: ['subjects', 'mss'] };

describe('«Назад» к родителю', () => {
  it('шагом по истории — только если предыдущая запись и есть родитель', () => {
    expect(canGoBackInHistory({ prev: 'settings/subjects' }, SUBJECTS)).toBe(true);
    expect(canGoBackInHistory({ prev: 'week' }, SUBJECTS)).toBe(false);
    expect(canGoBackInHistory(null, SUBJECTS)).toBe(false);
    expect(canGoBackInHistory('settings/subjects', SUBJECTS)).toBe(false);
  });
});

/** Мини-браузер: записи истории с hash и state; hashchange приходит асинхронно, как в настоящем. */
function fakeBrowser(startHash: string) {
  let entries = [{ hash: startHash, state: null as unknown }];
  let index = 0;
  const handlers: (() => void)[] = [];
  const fire = () => queueMicrotask(() => handlers.forEach((h) => h()));
  const location = {
    get hash() {
      return entries[index].hash;
    },
    set hash(value: string) {
      const hash = value.startsWith('#') ? value : `#${value}`;
      if (hash === entries[index].hash) return;
      entries = [...entries.slice(0, index + 1), { hash, state: null }];
      index++;
      fire();
    },
  };
  const history = {
    get state() {
      return entries[index].state;
    },
    replaceState(state: unknown, _title: string, url?: string) {
      entries[index] = { hash: url ?? entries[index].hash, state };
    },
    back() {
      if (index === 0) return;
      index--;
      fire();
    },
  };
  const win = {
    addEventListener(type: string, handler: () => void) {
      if (type === 'hashchange') handlers.push(handler);
    },
  };
  return {
    install() {
      handlers.length = 0;
      vi.stubGlobal('window', win);
      vi.stubGlobal('location', location);
      vi.stubGlobal('history', history);
    },
    /** Записи от начала до текущей. */
    trail: () => entries.slice(0, index + 1).map((e) => e.hash),
  };
}

/** Свежий модуль навигации — как после загрузки страницы. */
async function loadNav() {
  vi.resetModules();
  return import('./nav');
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('«Назад» в браузере', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('из «Предметов», открытых из настроек, возвращается шагом по истории', async () => {
    const b = fakeBrowser('#/settings');
    b.install();
    const nav = await loadNav();
    nav.navigate(SUBJECTS);
    await settle();
    nav.goBack(SETTINGS);
    await settle();
    expect(b.trail()).toEqual(['#/settings']);
  });

  it('с экрана, открытого из карточки предмета на «Неделе», ведёт к родителю, а не на «Неделю»', async () => {
    const b = fakeBrowser('#/week');
    b.install();
    const nav = await loadNav();
    nav.navigate(MSS);
    await settle();
    nav.goBack(SUBJECTS);
    await settle();
    expect(b.trail()).toEqual(['#/week', '#/settings/subjects']);
    nav.goBack(SETTINGS);
    await settle();
    expect(b.trail()).toEqual(['#/week', '#/settings']);
  });

  it('после перезагрузки страницы помнит, откуда пришли', async () => {
    const b = fakeBrowser('#/settings');
    b.install();
    let nav = await loadNav();
    nav.navigate(SUBJECTS);
    await settle();
    b.install();
    nav = await loadNav();
    nav.goBack(SETTINGS);
    await settle();
    expect(b.trail()).toEqual(['#/settings']);
  });

  it('открыли сразу вложенный экран — «Назад» заменяет адрес на родителя', async () => {
    const b = fakeBrowser('#/settings/about');
    b.install();
    const nav = await loadNav();
    nav.goBack(SETTINGS);
    await settle();
    expect(b.trail()).toEqual(['#/settings']);
  });
});
