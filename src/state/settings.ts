// Настройки пользователя. Хранятся на устройстве (localStorage), применяются сразу.
// Тему нужно знать до первой отрисовки, поэтому localStorage, а не IndexedDB.

import { useEffect, useState } from 'preact/hooks';
import { isSubjectColor, type SubjectColor } from '../core/colors';
import { ICONS, type IconName } from '../ui/iconData';

export type ThemeChoice = 'auto' | 'light' | 'dark' | 'amoled';
export type ResolvedTheme = 'light' | 'dark' | 'amoled';

export interface SubjectPrefs {
  color?: SubjectColor;
  icon?: IconName;
  short?: string;
  teacher?: string;
}

export interface Settings {
  /** Имя для приветствия. */
  name: string;
  theme: ThemeChoice;
  subgroup: 1 | 2;
  haptics: boolean;
  sidebarCollapsed: boolean;
  /** Изменения оформления предметов (цвет, иконка, сокращение, преподаватель). */
  subjects: Record<string, SubjectPrefs>;
  /** Уведомление «готово к работе без интернета» уже показывали. */
  offlineToastShown: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: 'Влад',
  theme: 'auto',
  subgroup: 1,
  haptics: true,
  sidebarCollapsed: false,
  subjects: {},
  offlineToastShown: false,
};

const THEMES: ThemeChoice[] = ['auto', 'light', 'dark', 'amoled'];

function cleanText(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

/** Разбирает сохранённые настройки: всё неизвестное или испорченное заменяется значением по умолчанию. */
export function parseSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const subjects: Record<string, SubjectPrefs> = {};
  if (s.subjects && typeof s.subjects === 'object') {
    for (const [id, p] of Object.entries(s.subjects as Record<string, unknown>)) {
      if (!p || typeof p !== 'object') continue;
      const prefs = p as Record<string, unknown>;
      const out: SubjectPrefs = {};
      if (isSubjectColor(prefs.color)) out.color = prefs.color;
      if (typeof prefs.icon === 'string' && prefs.icon in ICONS) out.icon = prefs.icon as IconName;
      const short = cleanText(prefs.short, 16)?.trim();
      if (short) out.short = short;
      const teacher = cleanText(prefs.teacher, 80);
      if (teacher?.trim()) out.teacher = teacher;
      if (Object.keys(out).length) subjects[id] = out;
    }
  }
  return {
    name: cleanText(s.name, 40) ?? DEFAULT_SETTINGS.name,
    theme: THEMES.includes(s.theme as ThemeChoice) ? (s.theme as ThemeChoice) : DEFAULT_SETTINGS.theme,
    subgroup: s.subgroup === 2 ? 2 : 1,
    haptics: typeof s.haptics === 'boolean' ? s.haptics : DEFAULT_SETTINGS.haptics,
    sidebarCollapsed: s.sidebarCollapsed === true,
    subjects,
    offlineToastShown: s.offlineToastShown === true,
  };
}

let storageKey = 'ucheba.settings';
let current: Settings = DEFAULT_SETTINGS;
const listeners = new Set<(s: Settings) => void>();

/** Превью дизайна хранит настройки отдельно, чтобы не трогать настройки приложения. */
export function initSettings(key = storageKey, overrides: Partial<Settings> = {}): Settings {
  storageKey = key;
  let stored: unknown = null;
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  } catch {
    stored = null;
  }
  current = { ...parseSettings(stored), ...overrides };
  applyTheme(current.theme);
  return current;
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const p = typeof patch === 'function' ? patch(current) : patch;
  current = { ...current, ...p };
  try {
    localStorage.setItem(storageKey, JSON.stringify(current));
  } catch {
    // Хранилище недоступно (приватный режим) — настройки живут до перезагрузки.
  }
  if ('theme' in p) applyTheme(current.theme);
  listeners.forEach((l) => l(current));
}

export function updateSubjectPrefs(id: string, patch: SubjectPrefs | null) {
  updateSettings((s) => {
    const subjects = { ...s.subjects };
    if (patch === null) delete subjects[id];
    else {
      const merged: SubjectPrefs = { ...subjects[id], ...patch };
      for (const k of Object.keys(merged) as (keyof SubjectPrefs)[]) if (merged[k] === undefined || merged[k] === '') delete merged[k];
      if (Object.keys(merged).length) subjects[id] = merged;
      else delete subjects[id];
    }
    return { subjects };
  });
}

export function useSettings(): Settings {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    setS(current);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

// ---------- Тема ----------

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'auto') return prefersDark ? 'dark' : 'light';
  return choice;
}

function paintTheme() {
  const theme = resolveTheme(current.theme, darkQuery?.matches ?? false);
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Цвет строки состояния берём из токена --bg текущей темы.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (bg) meta.content = bg;
}

let watching = false;
function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  current = { ...current, theme: choice };
  paintTheme();
  if (!watching && darkQuery) {
    watching = true;
    darkQuery.addEventListener('change', () => current.theme === 'auto' && paintTheme());
  }
}
