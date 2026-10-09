// Как выглядит предмет: сокращение, цвет, иконка — с учётом настроек пользователя.

import { assignSubjectColors, isSubjectColor, type SubjectColor } from '../core/colors';
import type { MainSchedule } from '../core/schedule';
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

function autoColors(main: MainSchedule): Record<string, SubjectColor> {
  let colors = autoCache.get(main);
  if (!colors) {
    colors = assignSubjectColors(main.subjects, main.week);
    autoCache.set(main, colors);
  }
  return colors;
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
