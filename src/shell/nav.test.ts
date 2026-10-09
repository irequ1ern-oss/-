import { describe, expect, it } from 'vitest';
import { parseHash, routeChain, routeToHash } from './nav';

describe('навигация', () => {
  it('разбирает и собирает адрес', () => {
    expect(parseHash('#/week')).toEqual({ tab: 'week', path: [] });
    expect(parseHash('#/settings/subjects/mss')).toEqual({ tab: 'settings', path: ['subjects', 'mss'] });
    expect(parseHash('')).toEqual({ tab: 'today', path: [] });
    expect(parseHash('#/непонятно')).toEqual({ tab: 'today', path: [] });
    expect(routeToHash({ tab: 'settings', path: ['subjects', 'mdk0401'] })).toBe('#/settings/subjects/mdk0401');
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
