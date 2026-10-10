import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, initSettings, parseSettings, resolveTheme, updateSettings, updateSubjectPrefs } from './settings';

describe('настройки', () => {
  it('по умолчанию: Влад, авто-тема, 1-я подгруппа, вибрация включена', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ name: 'Влад', theme: 'auto', subgroup: 1, haptics: true });
  });

  it('испорченные значения заменяются значениями по умолчанию', () => {
    const s = parseSettings({ name: 42, theme: 'neon', subgroup: 3, haptics: 'yes', subjects: { mss: { color: 'rainbow', icon: 'nope', short: '' } } });
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('сохраняет корректные изменения предметов', () => {
    const s = parseSettings({ subgroup: 2, theme: 'amoled', subjects: { mss: { color: 'teal', icon: 'ruler', short: 'Метр', teacher: 'Иванова И. И.' } } });
    expect(s.subgroup).toBe(2);
    expect(s.theme).toBe('amoled');
    expect(s.subjects.mss).toEqual({ color: 'teal', icon: 'ruler', short: 'Метр', teacher: 'Иванова И. И.' });
  });

  it('тема «Авто» следует системе', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('amoled', false)).toBe('amoled');
  });

  it('правка в одном окне не затирает правки, сохранённые другим окном', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    try {
      initSettings('test.settings');
      // Другое окно поменяло имя и цвет предмета…
      store.set('test.settings', JSON.stringify({ ...getSettings(), name: 'Аня', subjects: { mss: { color: 'teal' } } }));
      // …а это окно, ничего не зная об этом, выключило вибрацию и задало преподавателя.
      updateSettings({ haptics: false });
      updateSubjectPrefs('mss', { teacher: 'Иванова И. И.' });
      const saved = JSON.parse(store.get('test.settings')!);
      expect(saved).toMatchObject({ name: 'Аня', haptics: false });
      expect(saved.subjects.mss).toEqual({ color: 'teal', teacher: 'Иванова И. И.' });
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
