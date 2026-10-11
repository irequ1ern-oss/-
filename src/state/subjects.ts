// Как выглядит предмет: сокращение, цвет, иконка — с учётом настроек пользователя.

import { assignSubjectColors, AUTO_COLORS, isSubjectColor, type SubjectColor } from '../core/colors';
import type { MainSchedule, UserSubject } from '../core/schedule';
import { ICONS, type IconName } from '../ui/iconData';
import type { Settings } from './settings';

export interface SubjectView {
  id: string;
  short: string;
  full: string;
  color: SubjectColor;
  icon: IconName;
  teacher?: string;
}

const autoCache = new WeakMap<MainSchedule, Record<string, SubjectColor>>();
/** Расписание со своими предметами → исходное основное расписание (без них). */
const baseOf = new WeakMap<MainSchedule, MainSchedule>();
const withUserCache = new WeakMap<MainSchedule, { subjects: UserSubject[]; result: MainSchedule }>();

/**
 * Автоматические цвета считаются по основному расписанию без своих предметов: так цвета предметов
 * не меняются, когда пользователь добавляет «Практику». Свои предметы всегда с явным цветом, а предметы
 * с явным цветом, которых нет в неделе, на подбор не влияют.
 */
function autoColors(main: MainSchedule): Record<string, SubjectColor> {
  const base = baseOf.get(main) ?? main;
  let colors = autoCache.get(base);
  if (!colors) {
    const inWeek = new Set(Object.values(base.week).flatMap((day) => (day ?? []).map((l) => l.subjectId)));
    const subjects = base.subjects.filter((s) => inWeek.has(s.id) || !isSubjectColor(s.color));
    colors = assignSubjectColors(subjects, base.week);
    autoCache.set(base, colors);
  }
  return colors;
}

/**
 * Основное расписание вместе со своими предметами пользователя (чтобы subjectView и списки предметов их знали).
 * Без своих предметов возвращает то же расписание; для тех же входных данных — тот же объект.
 */
export function withUserSubjects(main: MainSchedule, subjects: UserSubject[]): MainSchedule {
  if (!subjects.length) return main;
  const cached = withUserCache.get(main);
  if (cached?.subjects === subjects) return cached.result;
  const known = new Set(main.subjects.map((s) => s.id));
  const extra = subjects.filter((s) => !s.deleted && !known.has(s.id));
  const result = extra.length ? { ...main, subjects: [...main.subjects, ...extra] } : main;
  if (result !== main) baseOf.set(result, baseOf.get(main) ?? main);
  withUserCache.set(main, { subjects, result });
  return result;
}

/** Цвет для нового своего предмета: из автопалитры, которого ещё нет у предметов, если такой остался. */
export function pickUserSubjectColor(main: MainSchedule): SubjectColor {
  const used = new Set<SubjectColor>(Object.values(autoColors(main)));
  for (const s of main.subjects) if (isSubjectColor(s.color)) used.add(s.color);
  return AUTO_COLORS.find((c) => !used.has(c)) ?? 'indigo';
}

export function subjectView(id: string, main: MainSchedule, settings: Settings): SubjectView {
  const base = main.subjects.find((s) => s.id === id);
  const prefs = settings.subjects[id] ?? {};
  const defaultIcon = base?.icon && base.icon in ICONS ? (base.icon as IconName) : 'book';
  const defaultColor = isSubjectColor(base?.color) ? base.color : (autoColors(main)[id] ?? 'gray');
  return {
    id,
    short: prefs.short ?? base?.short ?? id,
    full: base?.full ?? id,
    color: prefs.color ?? defaultColor,
    icon: prefs.icon ?? defaultIcon,
    teacher: prefs.teacher,
  };
}

/** Значения по умолчанию (без настроек) — для кнопки «Сбросить». */
export function subjectDefaults(id: string, main: MainSchedule): Pick<SubjectView, 'short' | 'color' | 'icon'> {
  const base = main.subjects.find((s) => s.id === id);
  return {
    short: base?.short ?? id,
    color: isSubjectColor(base?.color) ? base.color : (autoColors(main)[id] ?? 'gray'),
    icon: base?.icon && base.icon in ICONS ? (base.icon as IconName) : 'book',
  };
}
