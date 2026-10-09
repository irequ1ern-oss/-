import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, resolveTheme } from './settings';

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
});
