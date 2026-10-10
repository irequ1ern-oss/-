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

  // Хранилище в памяти вместо localStorage. failWrites — как переполненное хранилище.
  function fakeStorage(failWrites = false) {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (failWrites) throw new Error('QuotaExceededError');
        store.set(k, v);
      },
    };
    return store;
  }
  const dropStorage = () => delete (globalThis as { localStorage?: unknown }).localStorage;

  it('правка в одном окне не затирает правки, сохранённые другим окном', () => {
    const store = fakeStorage();
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
      dropStorage();
    }
  });

  it('тема из адреса превью действует в этом окне, пока её не выберут в настройках', () => {
    const store = fakeStorage();
    try {
      store.set('test.preview', JSON.stringify({ theme: 'light' }));
      initSettings('test.preview', { theme: 'dark' });
      expect(getSettings().theme).toBe('dark');
      expect(store.get('test.preview')).toBe(JSON.stringify({ theme: 'light' })); // ничего не записали
      updateSettings({ haptics: false });
      expect(getSettings().theme).toBe('dark'); // переключатель вибрации тему не сбросил
      expect(JSON.parse(store.get('test.preview')!)).toMatchObject({ theme: 'light', haptics: false }); // тему из адреса не записали
      updateSettings({ theme: 'amoled' });
      updateSettings({ haptics: true });
      expect(getSettings().theme).toBe('amoled'); // выбранная в настройках тема сохраняется
    } finally {
      dropStorage();
    }
  });

  it('localKeys: поле не берётся из других окон', () => {
    const store = fakeStorage();
    try {
      initSettings('test.gallery', {}, { localKeys: ['theme'] });
      updateSettings({ theme: 'dark' });
      store.set('test.gallery', JSON.stringify({ ...getSettings(), theme: 'light', subgroup: 2 }));
      updateSettings({ haptics: false });
      expect(getSettings()).toMatchObject({ theme: 'dark', subgroup: 2, haptics: false });
    } finally {
      dropStorage();
    }
  });

  it('если записать не получается, правки этой сессии не теряются', () => {
    const store = fakeStorage(true);
    try {
      store.set('test.full', JSON.stringify({ name: 'Старое' }));
      initSettings('test.full');
      updateSettings({ name: 'Новое' });
      updateSettings({ theme: 'dark' });
      expect(getSettings()).toMatchObject({ name: 'Новое', theme: 'dark' });
    } finally {
      dropStorage();
    }
  });
});
