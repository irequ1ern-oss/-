import { describe, expect, it } from 'vitest';
import { activePeriod, dayHasChanges, findNextLessonOfSubject, resolveDay } from './schedule';
import { override, period, sources } from './testData';

// 2026-10-12 — понедельник, 2026-10-15 — четверг, 2026-10-16 — пятница.

const brief = (date: string, src = sources()) =>
  resolveDay(date, src).lessons.map((l) => `${l.start} ${l.subjectId} ${l.status}`);

describe('resolveDay: основное расписание', () => {
  it('берёт пары по дню недели', () => {
    expect(brief('2026-10-12')).toEqual(['09:00 mss normal', '10:50 pfo normal']);
    expect(resolveDay('2026-10-12', sources()).lessons[0].source).toBe('main');
  });

  it('выходной — пустой день без изменений', () => {
    const day = resolveDay('2026-10-11', sources());
    expect(day.lessons).toEqual([]);
    expect(dayHasChanges(day)).toBe(false);
  });
});

describe('resolveDay: временное расписание на период', () => {
  const practice = period({
    from: '2026-10-12',
    to: '2026-10-23',
    title: 'Практика',
    week: { mon: [{ start: '08:30', end: '15:00', subjectId: 'prac' }] },
  });

  it('внутри периода заменяет основную неделю целиком', () => {
    const src = sources({ periods: [practice] });
    expect(brief('2026-10-12', src)).toEqual(['08:30 prac normal']);
    expect(brief('2026-10-15', src)).toEqual([]); // в периоде четверг пустой
    const day = resolveDay('2026-10-12', src);
    expect(day.period?.title).toBe('Практика');
    expect(day.lessons[0].source).toBe('period');
    expect(dayHasChanges(day)).toBe(true);
  });

  it('границы периода включительно, после окончания само возвращается основное', () => {
    const src = sources({ periods: [practice] });
    expect(resolveDay('2026-10-23', src).period).toBeDefined();
    expect(resolveDay('2026-10-24', src).period).toBeUndefined();
    expect(brief('2026-10-26', src)).toEqual(['09:00 mss normal', '10:50 pfo normal']);
    expect(brief('2026-10-09', src)).toEqual(['13:00 mss normal']);
  });

  it('каникулы — период с пустыми днями', () => {
    const src = sources({ periods: [period({ from: '2026-10-26', to: '2026-11-03', title: 'Каникулы' })] });
    expect(brief('2026-10-26', src)).toEqual([]);
    expect(brief('2026-11-02', src)).toEqual([]);
    expect(brief('2026-11-09', src)).toHaveLength(2);
  });

  it('при пересечении периодов побеждает созданный позже', () => {
    const older = period({ from: '2026-10-01', to: '2026-10-31', title: 'Старый', createdAt: '2026-09-01T10:00:00+03:00' });
    const newer = period({ from: '2026-10-12', to: '2026-10-14', title: 'Новый', createdAt: '2026-09-20T10:00:00+03:00' });
    expect(activePeriod('2026-10-13', [newer, older])?.title).toBe('Новый');
    expect(activePeriod('2026-10-20', [newer, older])?.title).toBe('Старый');
  });

  it('удалённый период не действует', () => {
    const src = sources({ periods: [{ ...practice, deleted: true }] });
    expect(resolveDay('2026-10-12', src).period).toBeUndefined();
  });
});

describe('resolveDay: изменения на дату', () => {
  it('отмена пары: пара остаётся в списке, но помечена отменённой', () => {
    const src = sources({ overrides: [override({ date: '2026-10-12', action: 'cancel', target: '09:00', note: 'болеет' })] });
    expect(brief('2026-10-12', src)).toEqual(['09:00 mss cancelled', '10:50 pfo normal']);
    expect(resolveDay('2026-10-12', src).lessons[0].changeNote).toBe('болеет');
  });

  it('замена предмета и кабинета запоминает исходную пару', () => {
    const src = sources({
      overrides: [override({ date: '2026-10-12', action: 'replace', target: '10:50', lesson: { subjectId: 'ig', room: '25' } })],
    });
    const l = resolveDay('2026-10-12', src).lessons[1];
    expect([l.subjectId, l.room, l.status, l.start]).toEqual(['ig', '25', 'changed', '10:50']);
    expect(l.original).toEqual({ start: '10:50', end: '12:40', subjectId: 'pfo', room: '27' });
  });

  it('добавленная пара встаёт по времени', () => {
    const src = sources({
      overrides: [override({ date: '2026-10-12', action: 'add', lesson: { start: '13:00', end: '14:40', subjectId: 'ig' } })],
    });
    expect(brief('2026-10-12', src)).toEqual(['09:00 mss normal', '10:50 pfo normal', '13:00 ig added']);
    expect(brief('2026-10-11', src)).toEqual([]);
  });

  it('отмена всего дня', () => {
    const src = sources({ overrides: [override({ date: '2026-10-12', action: 'cancelDay' })] });
    expect(brief('2026-10-12', src)).toEqual(['09:00 mss cancelled', '10:50 pfo cancelled']);
  });

  it('изменения на дату важнее временного расписания', () => {
    const src = sources({
      periods: [period({ from: '2026-10-12', to: '2026-10-16', week: { mon: [{ start: '08:30', end: '15:00', subjectId: 'prac' }] } })],
      overrides: [override({ date: '2026-10-12', action: 'replace', target: '08:30', lesson: { end: '12:00' } })],
    });
    const l = resolveDay('2026-10-12', src).lessons[0];
    expect([l.subjectId, l.end, l.source, l.status]).toEqual(['prac', '12:00', 'period', 'changed']);
  });

  it('изменение без подходящей пары не ломает день и попадает в unmatched', () => {
    const o = override({ date: '2026-10-12', action: 'cancel', target: '15:00' });
    const day = resolveDay('2026-10-12', sources({ overrides: [o] }));
    expect(day.lessons).toHaveLength(2);
    expect(day.unmatched).toEqual([o]);
  });

  it('удалённое изменение не действует', () => {
    const src = sources({ overrides: [{ ...override({ date: '2026-10-12', action: 'cancelDay' }), deleted: true }] });
    expect(brief('2026-10-12', src)).toEqual(['09:00 mss normal', '10:50 pfo normal']);
  });
});

describe('findNextLessonOfSubject', () => {
  it('следующий день с этим предметом, пары в тот же день не считаются', () => {
    // В четверг ИГ две пары подряд — срок ДЗ с первой из них не «через пару», а следующая неделя.
    expect(findNextLessonOfSubject('ig', '2026-10-15', sources())?.date).toBe('2026-10-21');
    expect(findNextLessonOfSubject('mss', '2026-10-12', sources())?.date).toBe('2026-10-16');
  });

  it('учитывает временное расписание', () => {
    const src = sources({ periods: [period({ from: '2026-10-13', to: '2026-10-25', title: 'Практика' })] });
    expect(findNextLessonOfSubject('mss', '2026-10-12', src)?.date).toBe('2026-10-26');
  });

  it('учитывает отмену и добавленную пару', () => {
    const cancelled = sources({ overrides: [override({ date: '2026-10-16', action: 'cancel', target: '13:00' })] });
    expect(findNextLessonOfSubject('mss', '2026-10-12', cancelled)?.date).toBe('2026-10-19');

    const added = sources({
      overrides: [override({ date: '2026-10-14', action: 'add', lesson: { start: '11:00', end: '11:45', subjectId: 'mss' } })],
    });
    const l = findNextLessonOfSubject('mss', '2026-10-12', added);
    expect([l?.date, l?.start, l?.status]).toEqual(['2026-10-14', '11:00', 'added']);
  });

  it('возвращает null, если предмета нет в ближайшие дни', () => {
    expect(findNextLessonOfSubject('prac', '2026-10-12', sources())).toBeNull();
  });
});
