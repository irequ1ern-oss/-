import { describe, expect, it } from 'vitest';
import { resolveDay } from '../../core/schedule';
import { override, period, sources } from '../../core/testData';
import type { HomeworkItem } from '../../shell/app';
import { dayMarks, dayPillLabel, directionTo, sameWeekdayIn, swipeOutcome, weekCaption, weekOffset } from './weekLogic';

describe('подпись недели', () => {
  it('смещение считается по понедельникам', () => {
    expect(weekOffset('2026-10-14', '2026-10-12')).toBe(0);
    expect(weekOffset('2026-10-14', '2026-10-18')).toBe(0);
    expect(weekOffset('2026-10-14', '2026-10-19')).toBe(1);
    expect(weekOffset('2026-10-12', '2026-10-09')).toBe(-1);
    expect(weekOffset('2026-10-12', '2026-11-02')).toBe(3);
  });

  it('эта / следующая / прошлая и склонения', () => {
    expect(weekCaption(0)).toBe('Эта неделя');
    expect(weekCaption(1)).toBe('Следующая неделя');
    expect(weekCaption(-1)).toBe('Прошлая неделя');
    expect(weekCaption(2)).toBe('Через 2 недели');
    expect(weekCaption(5)).toBe('Через 5 недель');
    expect(weekCaption(21)).toBe('Через 21 неделю');
    expect(weekCaption(-2)).toBe('2 недели назад');
    expect(weekCaption(-11)).toBe('11 недель назад');
  });
});

describe('отметки под днями', () => {
  const hw = (due: string, done = false): HomeworkItem => ({ id: due + done, subjectId: 'mss', title: 'Задача', due, done });

  it('изменения и невыполненные ДЗ на этот день', () => {
    const src = sources({ overrides: [override({ date: '2026-10-15', action: 'cancel', target: '09:00' })] });
    const homework = [hw('2026-10-15'), hw('2026-10-15', true), hw('2026-10-16')];
    expect(dayMarks(resolveDay('2026-10-15', src), homework)).toEqual({ changes: true, homework: 1 });
    expect(dayMarks(resolveDay('2026-10-14', src), homework)).toEqual({ changes: false, homework: 0 });
  });

  it('временное расписание тоже считается изменением', () => {
    const src = sources({ periods: [period({ from: '2026-10-12', to: '2026-10-16' })] });
    expect(dayMarks(resolveDay('2026-10-13', src), []).changes).toBe(true);
  });

  it('подпись для диктора', () => {
    const src = sources({ overrides: [override({ date: '2026-10-15', action: 'cancelDay' })] });
    expect(dayPillLabel(resolveDay('2026-10-12', src), '2026-10-12', { changes: false, homework: 2 })).toBe(
      'Понедельник, 12 октября, сегодня, 2 пары, ДЗ: 2',
    );
    expect(dayPillLabel(resolveDay('2026-10-13', src), '2026-10-12', { changes: false, homework: 0 })).toBe(
      'Вторник, 13 октября, пар нет',
    );
    expect(dayPillLabel(resolveDay('2026-10-15', src), '2026-10-12', { changes: true, homework: 0 })).toBe(
      'Четверг, 15 октября, пары отменены, есть изменения',
    );
  });
});

describe('листание недель кнопками', () => {
  it('тот же день недели', () => {
    expect(sameWeekdayIn('2026-10-14', 1, sources())).toBe('2026-10-21');
    expect(sameWeekdayIn('2026-10-14', -2, sources())).toBe('2026-09-30');
  });

  it('суббота без пар → пятница той недели, суббота с парами остаётся', () => {
    const sat = sources({ overrides: [override({ date: '2026-10-17', action: 'add', lesson: { start: '09:00', end: '10:00', subjectId: 'ig' } })] });
    expect(sameWeekdayIn('2026-10-17', 1, sat)).toBe('2026-10-23');
    expect(sameWeekdayIn('2026-10-24', -1, sat)).toBe('2026-10-17');
  });

  it('направление перехода', () => {
    expect(directionTo('2026-10-12', '2026-10-15')).toBe(1);
    expect(directionTo('2026-10-12', '2026-10-09')).toBe(-1);
  });
});

describe('решение по свайпу', () => {
  const W = 400;
  it('медленно: больше четверти ширины — переход, меньше — назад', () => {
    expect(swipeOutcome(-120, -0.1, W)).toBe(1);
    expect(swipeOutcome(120, 0.1, W)).toBe(-1);
    expect(swipeOutcome(-80, -0.1, W)).toBe(0);
    expect(swipeOutcome(3, 0, W)).toBe(0);
  });

  it('быстрый бросок срабатывает и на коротком пути', () => {
    expect(swipeOutcome(-40, -0.8, W)).toBe(1);
    expect(swipeOutcome(40, 0.8, W)).toBe(-1);
    expect(swipeOutcome(-15, -0.8, W)).toBe(0);
  });

  it('бросок в обратную сторону отменяет переход', () => {
    expect(swipeOutcome(-150, 0.6, W)).toBe(0);
  });
});
