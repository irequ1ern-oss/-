import { describe, expect, it } from 'vitest';
import { AUTO_COLORS } from '../core/colors';
import type { MainSchedule, UserSubject } from '../core/schedule';
import { testMain } from '../core/testData';
import { mainSchedule } from '../data/schedule';
import { DEFAULT_SETTINGS } from './settings';
import { pickUserSubjectColor, subjectDefaults, subjectView, withUserSubjects } from './subjects';

function userSubject(id: string, extra: Partial<UserSubject> = {}): UserSubject {
  const t = '2026-10-12T07:00:00.000Z';
  return { id, short: 'Практика', full: 'Учебная практика', color: 'indigo', icon: 'hammer', createdAt: t, updatedAt: t, ...extra };
}

describe('свои предметы', () => {
  it('без своих предметов — то же расписание', () => {
    expect(withUserSubjects(mainSchedule, [])).toBe(mainSchedule);
  });

  it('свои предметы добавляются к основным; те же входные данные — тот же объект', () => {
    const subjects = [userSubject('u1'), userSubject('gone', { deleted: true }), userSubject('mss')];
    const merged = withUserSubjects(mainSchedule, subjects);
    expect(merged).not.toBe(mainSchedule);
    expect(merged.subjects.map((s) => s.id)).toEqual([...mainSchedule.subjects.map((s) => s.id), 'u1']);
    expect(merged.week).toBe(mainSchedule.week);
    expect(withUserSubjects(mainSchedule, subjects)).toBe(merged);
    // Повторное объединение ничего не добавляет.
    expect(withUserSubjects(merged, subjects)).toBe(merged);
  });

  it('вид своего предмета: его цвет, иконка и название', () => {
    const merged = withUserSubjects(mainSchedule, [userSubject('u1', { color: 'mint' })]);
    expect(subjectView('u1', merged, DEFAULT_SETTINGS)).toMatchObject({ short: 'Практика', full: 'Учебная практика', color: 'mint', icon: 'hammer' });
  });

  it('цвета основных предметов не меняются, когда добавляют свои', () => {
    const colorsOf = (main: MainSchedule) =>
      Object.fromEntries(mainSchedule.subjects.map((s) => [s.id, subjectDefaults(s.id, main).color]));
    const before = colorsOf(mainSchedule);
    for (const color of AUTO_COLORS) {
      const merged = withUserSubjects(mainSchedule, [userSubject(`u-${color}`, { color }), userSubject('u2', { color })]);
      expect(colorsOf(merged)).toEqual(before);
    }
    // И для расписания, собранного вручную (свой предмет с цветом, которого нет в неделе).
    const manual: MainSchedule = { ...testMain, subjects: [userSubject('u1', { color: 'blue' }), ...testMain.subjects] };
    const plain = Object.fromEntries(testMain.subjects.map((s) => [s.id, subjectDefaults(s.id, testMain).color]));
    expect(Object.fromEntries(testMain.subjects.map((s) => [s.id, subjectDefaults(s.id, manual).color]))).toEqual(plain);
  });

  it('цвет нового предмета — свободный из автопалитры, иначе индиго', () => {
    // В тестовом расписании четыре предмета: свободные цвета остаются.
    const used = new Set(testMain.subjects.map((s) => subjectDefaults(s.id, testMain).color));
    const color = pickUserSubjectColor(testMain);
    expect(AUTO_COLORS).toContain(color);
    expect(used.has(color)).toBe(false);
    // Свой предмет уже занял этот цвет — следующий получит другой.
    const merged = withUserSubjects(testMain, [userSubject('u1', { color })]);
    expect(pickUserSubjectColor(merged)).not.toBe(color);
    // Все цвета автопалитры заняты — индиго.
    const full = withUserSubjects(testMain, AUTO_COLORS.map((c) => userSubject(`u-${c}`, { color: c })));
    expect(pickUserSubjectColor(full)).toBe('indigo');
    // Настоящее расписание: цвет, которого нет ни у одного предмета.
    const real = pickUserSubjectColor(mainSchedule);
    expect(mainSchedule.subjects.map((s) => subjectDefaults(s.id, mainSchedule).color)).not.toContain(real);
  });
});
