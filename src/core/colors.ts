// Цвета предметов: палитра системных цветов iOS и автоматический подбор,
// чтобы предметы одного дня заметно различались.

import type { Subject, Week } from './schedule';
import { WEEKDAY_KEYS } from './time';

export const SUBJECT_COLORS = [
  'blue', 'indigo', 'purple', 'teal', 'cyan', 'mint', 'green', 'yellow', 'orange', 'brown', 'gray', 'red', 'pink',
] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];

export const COLOR_NAMES: Record<SubjectColor, string> = {
  blue: 'Синий', indigo: 'Индиго', purple: 'Фиолетовый', teal: 'Бирюзовый', cyan: 'Голубой', mint: 'Мятный',
  green: 'Зелёный', yellow: 'Жёлтый', orange: 'Оранжевый', brown: 'Коричневый', gray: 'Серый', red: 'Красный', pink: 'Розовый',
};

/** Светлые варианты (для расчёта различимости; сами цвета на экране берутся из CSS-переменных). */
const LIGHT_HEX: Record<SubjectColor, string> = {
  blue: '#007AFF', indigo: '#5856D6', purple: '#AF52DE', teal: '#30B0C7', cyan: '#32ADE6', mint: '#00C7BE',
  green: '#34C759', yellow: '#FFCC00', orange: '#FF9500', brown: '#A2845E', gray: '#8E8E93', red: '#FF3B30', pink: '#FF2D55',
};

/** Варианты тёмной темы и AMOLED (те же, что --sc-* в tokens.css): там бирюзовый и голубой ближе друг к другу. */
const DARK_HEX: Record<SubjectColor, string> = {
  blue: '#0A84FF', indigo: '#5E5CE6', purple: '#BF5AF2', teal: '#40C8E0', cyan: '#64D2FF', mint: '#63E6E2',
  green: '#30D158', yellow: '#FFD60A', orange: '#FF9F0A', brown: '#AC8E68', gray: '#8E8E93', red: '#FF453A', pink: '#FF375F',
};

/**
 * Автоматически не раздаём красный и розовый (их легко спутать с вишнёвым акцентом)
 * и серый (кольцо таймера серого цвета выглядит неактивным). Вручную в настройках можно выбрать любой.
 */
export const AUTO_COLORS: SubjectColor[] = SUBJECT_COLORS.filter((c) => c !== 'red' && c !== 'pink' && c !== 'gray');

export function isSubjectColor(value: unknown): value is SubjectColor {
  return typeof value === 'string' && (SUBJECT_COLORS as readonly string[]).includes(value);
}

function toLab(hex: string): [number, number, number] {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(hexA: string, hexB: string): number {
  const [l1, a1, b1] = toLab(hexA);
  const [l2, a2, b2] = toLab(hexB);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * Насколько цвета различаются на глаз (ΔE в пространстве Lab; больше — заметнее).
 * Без темы — меньшее из светлой и тёмной: цвета должны различаться в любой теме.
 */
export function colorDistance(a: SubjectColor, b: SubjectColor, theme?: 'light' | 'dark'): number {
  if (theme === 'light') return deltaE(LIGHT_HEX[a], LIGHT_HEX[b]);
  if (theme === 'dark') return deltaE(DARK_HEX[a], DARK_HEX[b]);
  return Math.min(deltaE(LIGHT_HEX[a], LIGHT_HEX[b]), deltaE(DARK_HEX[a], DARK_HEX[b]));
}

/** Те же значения, что --sc-* в tokens.css (проверяется тестом). */
export const SUBJECT_HEX = { light: LIGHT_HEX, dark: DARK_HEX } as const;

/** Ниже этого ΔE цвета предметов одного дня легко спутать. */
export const MIN_SAME_DAY_DISTANCE = 30;

/**
 * Подбирает цвет каждому предмету. Предметы одного дня получают разные цвета,
 * а пары, идущие подряд, — особенно непохожие. Результат всегда одинаковый для одного расписания.
 * Цвет, указанный в schedule.json (поле color), сохраняется.
 */
export function assignSubjectColors(subjects: Subject[], week: Week): Record<string, SubjectColor> {
  const ids = subjects.map((s) => s.id);
  const weight = new Map<string, Map<string, number>>(ids.map((id) => [id, new Map()]));
  const bump = (a: string, b: string, w: number) => {
    if (a === b || !weight.has(a) || !weight.has(b)) return;
    weight.get(a)!.set(b, (weight.get(a)!.get(b) ?? 0) + w);
    weight.get(b)!.set(a, (weight.get(b)!.get(a) ?? 0) + w);
  };
  for (const key of WEEKDAY_KEYS) {
    const lessons = week[key] ?? [];
    const daySubjects = [...new Set(lessons.map((l) => l.subjectId))];
    for (let i = 0; i < daySubjects.length; i++)
      for (let j = i + 1; j < daySubjects.length; j++) bump(daySubjects[i], daySubjects[j], 1);
    for (let i = 1; i < lessons.length; i++) bump(lessons[i - 1].subjectId, lessons[i].subjectId, 2);
  }

  const result: Record<string, SubjectColor> = {};
  for (const s of subjects) if (isSubjectColor(s.color)) result[s.id] = s.color;

  const degree = (id: string) => [...weight.get(id)!.values()].reduce((a, b) => a + b, 0);
  const order = ids.filter((id) => !result[id]).sort((a, b) => degree(b) - degree(a) || ids.indexOf(a) - ids.indexOf(b));
  const used = new Map<SubjectColor, number>();
  for (const c of Object.values(result)) used.set(c, (used.get(c) ?? 0) + 1);

  for (const id of order) {
    let best: SubjectColor = AUTO_COLORS[0];
    let bestCost = Infinity;
    for (const color of AUTO_COLORS) {
      let cost = (used.get(color) ?? 0) * 12; // сначала используем всю палитру, повторы — только когда цвета кончились
      for (const [other, w] of weight.get(id)!) {
        const oc = result[other];
        if (!oc) continue;
        const d = colorDistance(color, oc);
        // Похожий цвет в тот же день хуже, чем повтор цвета у предметов из разных дней.
        cost += w * (oc === color ? 100 : (d < MIN_SAME_DAY_DISTANCE ? 50 : 0) + Math.max(0, 60 - d) / 6);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = color;
      }
    }
    result[id] = best;
    used.set(best, (used.get(best) ?? 0) + 1);
  }
  return result;
}
