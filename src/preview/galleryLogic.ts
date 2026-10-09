// Расчёты страницы превью: масштаб рамок устройств, адреса демо-приложения, синхронизация настроек.

import { parseSettings, type Settings, type ThemeChoice } from '../state/settings';
import type { PresetName } from './presets';

export interface FrameSize {
  width: number;
  height: number;
}

export const PHONE_SIZE: FrameSize = { width: 412, height: 915 };
export const TABLET_LANDSCAPE: FrameSize = { width: 1340, height: 840 };
export const TABLET_PORTRAIT: FrameSize = { width: 840, height: 1340 };

/**
 * Во сколько раз уменьшить экран устройства, чтобы он влез в рамку:
 * по ширине, а если задана высота — то и по высоте. Крупнее настоящего размера не делаем.
 */
export function fitScale(size: FrameSize, availWidth: number, availHeight = Infinity): number {
  if (!(availWidth > 0) || !(availHeight > 0)) return 0;
  return Math.min(1, availWidth / size.width, availHeight / size.height);
}

/** Сколько места по высоте отдать рамке: экран минус верхняя панель и поля, но не меньше minHeight. */
export function frameMaxHeight(viewportHeight: number, reserved: number, minHeight = 360): number {
  return Math.max(minHeight, viewportHeight - reserved);
}

/** Только адреса экранов приложения (#/week, #/settings/subjects/mss); остальные якоря отбрасываем. */
export function routeHash(hash: string | null | undefined): string {
  return hash && /^#\/[\w/%.-]*$/.test(hash) ? hash : '';
}

export interface AppUrlOptions {
  state: PresetName;
  theme: ThemeChoice;
  /** Экран приложения, например '#/week'. */
  hash?: string;
}

/** Адрес демо-приложения: …/preview/app.html?state=lesson&theme=dark#/week */
export function appUrl(base: string, { state, theme, hash }: AppUrlOptions): string {
  return `${base}?state=${encodeURIComponent(state)}&theme=${encodeURIComponent(theme)}${routeHash(hash)}`;
}

/** Делит список на n столбцов по порядку (первые столбцы длиннее): для широкого экрана. */
export function splitColumns<T>(items: T[], n: number): T[][] {
  const cols = Math.max(1, Math.floor(n));
  const per = Math.ceil(items.length / cols);
  const out: T[][] = [];
  for (let i = 0; i < cols; i++) {
    const part = items.slice(i * per, (i + 1) * per);
    if (part.length) out.push(part);
  }
  return out.length ? out : [[]];
}

/**
 * Настройки поменяли внутри рамки с приложением (цвет предмета, подгруппа, меню планшета) —
 * страница превью подхватывает всё, кроме темы: её выбирают переключателем вверху страницы.
 * null — если менять нечего или запись испорчена.
 */
export function externalPatch(current: Settings, raw: string | null): Partial<Settings> | null {
  if (!raw) return null;
  let incoming: Settings;
  try {
    incoming = parseSettings(JSON.parse(raw));
  } catch {
    return null;
  }
  const patch: Partial<Settings> = {};
  for (const key of Object.keys(incoming) as (keyof Settings)[]) {
    if (key === 'theme') continue;
    if (JSON.stringify(incoming[key]) !== JSON.stringify(current[key])) {
      (patch as Record<string, unknown>)[key] = incoming[key];
    }
  }
  return Object.keys(patch).length ? patch : null;
}
