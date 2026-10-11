import { describe, expect, it } from 'vitest';
import scheduleJson from '../../data/schedule.json';
import {
  addLessonOverride,
  cancelDayOverride,
  cancelLessonOverride,
  copyWeek,
  countWeekdays,
  dayOverlaps,
  defaultPracticeSpec,
  describeOverride,
  describePeriodDates,
  describePractice,
  describeWeekdays,
  groupOverridesByDate,
  liveOverridesOn,
  newPeriod,
  periodStatus,
  practiceWeek,
  replaceLessonOverride,
  validateLessonInput,
  validatePeriodInput,
  validatePracticeInput,
  type Stamp,
} from './changes';
import { lessonRoom, resolveDay, type DateOverride, type MainSchedule, type PracticeSpec, type ScheduleSources } from './schedule';
import { sources, testMain } from './testData';

// 2026-10-12 — понедельник, 2026-10-15 — четверг.

const real = scheduleJson as MainSchedule;
const realSources = (extra: Partial<ScheduleSources> = {}): ScheduleSources => ({ main: real, periods: [], overrides: [], ...extra });

let n = 0;
/** Метка времени: каждая следующая создана позже предыдущей. */
function stamp(id?: string): Stamp {
  n++;
  return { id: id ?? `s${n}`, now: new Date(Date.UTC(2026, 9, 1, 7, 0, n)).toISOString() };
}

const nameOf = (main: MainSchedule) => (id: string) => main.subjects.find((s) => s.id === id)?.short ?? id;
const testName = nameOf(testMain);
const realName = nameOf(real);
const known = (main: MainSchedule) => (id: string) => main.subjects.some((s) => s.id === id);

const brief = (date: string, src: ScheduleSources) =>
  resolveDay(date, src).lessons.map((l) => `${l.start} ${l.subjectId} ${l.status}`);

describe('изменения на дату: сборка', () => {
  it('отмена пары: id, дата, время создания; причина без пробелов по краям', () => {
    const s = stamp('a');
    expect(cancelLessonOverride('2026-10-12', '09:00', s, '  болеет ')).toEqual({
      id: 'a',
      date: '2026-10-12',
      action: 'cancel',
      target: '09:00',
      note: 'болеет',
      createdAt: s.now,
      updatedAt: s.now,
    });
  });

  it('пустая причина не сохраняется', () => {
    expect('note' in cancelLessonOverride('2026-10-12', '09:00', stamp(), '  ')).toBe(false);
    expect('note' in cancelDayOverride('2026-10-12', stamp())).toBe(false);
  });

  it('замена: в patch только указанные поля, кабинеты — своим массивом', () => {
    const rooms = ['27', '25'];
    const o = replaceLessonOverride('2026-10-15', '09:00', { subjectId: 'ig', room: undefined, rooms }, stamp());
    rooms[0] = '99';
    expect(o.action === 'replace' && o.lesson).toEqual({ subjectId: 'ig', rooms: ['27', '25'] });
    expect(o.action === 'replace' && 'room' in o.lesson).toBe(false);
  });

  it('добавленная пара — копия, а не ссылка', () => {
    const lesson = { start: '13:00', end: '14:40', subjectId: 'ig', rooms: ['27', '25'], note: undefined };
    const o = addLessonOverride('2026-10-12', lesson, stamp());
    lesson.rooms[0] = '99';
    expect(o.action === 'add' && o.lesson).toEqual({ start: '13:00', end: '14:40', subjectId: 'ig', rooms: ['27', '25'] });
  });

  it('отмена дня', () => {
    const s = stamp('d');
    expect(cancelDayOverride('2026-11-04', s, 'День народного единства')).toEqual({
      id: 'd',
      date: '2026-11-04',
      action: 'cancelDay',
      note: 'День народного единства',
      createdAt: s.now,
      updatedAt: s.now,
    });
  });
});

describe('изменения на дату: resolveDay их применяет', () => {
  it('отмена, замена и добавление', () => {
    const src = sources({
      overrides: [
        cancelLessonOverride('2026-10-12', '09:00', stamp()),
        replaceLessonOverride('2026-10-12', '10:50', { subjectId: 'ig', room: '25' }, stamp()),
        addLessonOverride('2026-10-12', { start: '13:00', end: '14:40', subjectId: 'mss' }, stamp(), 'перенос'),
      ],
    });
    expect(brief('2026-10-12', src)).toEqual(['09:00 mss cancelled', '10:50 ig changed', '13:00 mss added']);
    const day = resolveDay('2026-10-12', src);
    expect(day.lessons[1].original).toEqual({ start: '10:50', end: '12:40', subjectId: 'pfo', room: '27' });
    expect(day.lessons[2].changeNote).toBe('перенос');
    expect(day.unmatched).toEqual([]);
  });

  it('отмена всего дня', () => {
    const src = sources({ overrides: [cancelDayOverride('2026-10-12', stamp(), 'праздник')] });
    expect(brief('2026-10-12', src)).toEqual(['09:00 mss cancelled', '10:50 pfo cancelled']);
    expect(resolveDay('2026-10-12', src).lessons[0].changeNote).toBe('праздник');
  });

  it('изменения применяются в порядке создания, а не в порядке списка', () => {
    const first = replaceLessonOverride('2026-10-12', '09:00', { subjectId: 'ig' }, stamp('z'));
    const second = replaceLessonOverride('2026-10-12', '09:00', { room: '12' }, stamp('a'));
    const l = resolveDay('2026-10-12', sources({ overrides: [second, first] })).lessons[0];
    expect([l.subjectId, l.room, l.status]).toEqual(['ig', '12', 'changed']);
    expect(l.original).toEqual({ start: '09:00', end: '10:40', subjectId: 'mss', room: '27' });

    // Сдвиг начала, а потом отмена по старому времени — пара уже не найдена.
    const move = replaceLessonOverride('2026-10-12', '09:00', { start: '09:30' }, stamp());
    const cancel = cancelLessonOverride('2026-10-12', '09:00', stamp());
    const day = resolveDay('2026-10-12', sources({ overrides: [cancel, move] }));
    expect(day.lessons[0].start).toBe('09:30');
    expect(day.unmatched).toEqual([cancel]);
  });

  it('пара, добавленная после отмены дня, остаётся; добавленная до — отменяется вместе с днём', () => {
    const before = addLessonOverride('2026-10-12', { start: '08:00', end: '08:45', subjectId: 'ig' }, stamp());
    const day = cancelDayOverride('2026-10-12', stamp());
    const after = addLessonOverride('2026-10-12', { start: '13:00', end: '14:40', subjectId: 'prac' }, stamp());
    expect(brief('2026-10-12', sources({ overrides: [after, day, before] }))).toEqual([
      '08:00 ig cancelled',
      '09:00 mss cancelled',
      '10:50 pfo cancelled',
      '13:00 prac added',
    ]);
  });

  it('замена кабинета у пары с кабинетами по подгруппам: один кабинет для всех', () => {
    const src = realSources({ overrides: [replaceLessonOverride('2026-10-15', '09:00', { room: '12' }, stamp())] });
    const l = resolveDay('2026-10-15', src).lessons[0];
    expect([lessonRoom(l, 1), lessonRoom(l, 2), l.rooms]).toEqual(['12', '12', undefined]);
    expect(l.original?.rooms).toEqual(['27', '25']);
    // Остальные пары дня не затронуты.
    expect(lessonRoom(resolveDay('2026-10-15', src).lessons[1], 2)).toBe('25');
  });
});

describe('копия недели и шаблон «Практика»', () => {
  it('copyWeek — полная копия', () => {
    const copy = copyWeek(real.week);
    expect(copy).toEqual(real.week);
    copy.thu![0].rooms![0] = '99';
    copy.thu![0].subjectId = 'mss';
    copy.mon!.pop();
    expect(real.week.thu![0].rooms).toEqual(['27', '25']);
    expect(real.week.thu![0].subjectId).toBe('ig');
    expect(real.week.mon).toHaveLength(5);
    expect(copyWeek({})).toEqual({});
  });

  it('practiceWeek: дни по порядку, без повторов, у каждого дня своя пара', () => {
    const week = practiceWeek({ subjectId: 'prac', start: '09:00', end: '14:40', room: ' 8 ', note: ' ', days: ['fri', 'mon', 'mon'] });
    expect(Object.keys(week)).toEqual(['mon', 'fri']);
    expect(week.mon).toEqual([{ start: '09:00', end: '14:40', subjectId: 'prac', room: '8' }]);
    expect(week.mon![0]).not.toBe(week.fri![0]);
    expect(practiceWeek({ ...defaultPracticeSpec('prac'), days: [] })).toEqual({});
  });
});

describe('newPeriod', () => {
  it('custom: копия основной недели, название по умолчанию', () => {
    const s = stamp('p');
    const p = newPeriod('custom', '2026-10-19', '2026-10-31', s, { mainWeek: testMain.week });
    expect(p).toMatchObject({ id: 'p', title: 'Временное расписание', from: '2026-10-19', to: '2026-10-31', kind: 'custom' });
    expect([p.createdAt, p.updatedAt]).toEqual([s.now, s.now]);
    expect(p.week).toEqual(testMain.week);
    expect(p.week.mon).not.toBe(testMain.week.mon);
    expect(p.practice).toBeUndefined();
    expect(validatePeriodInput(p, known(testMain))).toEqual([]);
    expect(newPeriod('custom', '2026-10-19', '2026-10-31', stamp(), { mainWeek: {}, title: '  Сессия ' }).title).toBe('Сессия');
  });

  it('practice: неделя из шаблона, шаблон сохраняется', () => {
    const spec: PracticeSpec = { subjectId: 'prac', start: '09:00', end: '14:40', room: '8', days: ['wed', 'mon'] };
    const p = newPeriod('practice', '2026-10-19', '2026-10-30', stamp(), { mainWeek: testMain.week, practice: spec, title: ' ' });
    expect(p.title).toBe('Практика');
    expect(p.kind).toBe('practice');
    expect(p.practice).toEqual({ subjectId: 'prac', start: '09:00', end: '14:40', room: '8', days: ['mon', 'wed'] });
    expect(p.practice).not.toBe(spec);
    expect(p.week).toEqual(practiceWeek(spec));
    expect(validatePeriodInput(p, known(testMain))).toEqual([]);

    const src = sources({ periods: [p] });
    expect(brief('2026-10-19', src)).toEqual(['09:00 prac normal']);
    expect(brief('2026-10-20', src)).toEqual([]);
    expect(brief('2026-11-02', src)).toEqual(['09:00 mss normal', '10:50 pfo normal']);
  });

  it('practice без шаблона — шаблон по умолчанию (пн–пт), предмет ещё не выбран', () => {
    const p = newPeriod('practice', '2026-10-19', '2026-10-30', stamp(), { mainWeek: testMain.week });
    expect(p.practice).toEqual(defaultPracticeSpec());
    expect(Object.keys(p.week)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(validatePeriodInput(p, known(testMain))).toContain('Понедельник, пара 1: выбери предмет');
  });

  it('break: дни без пар', () => {
    const p = newPeriod('break', '2026-12-29', '2027-01-11', stamp(), { mainWeek: testMain.week, practice: defaultPracticeSpec('prac') });
    expect([p.title, p.kind, p.week, p.practice]).toEqual(['Каникулы', 'break', {}, undefined]);
    expect(brief('2027-01-11', sources({ periods: [p] }))).toEqual([]);
    expect(validatePeriodInput(p, known(testMain))).toEqual([]);
  });
});

describe('списки', () => {
  const a = cancelLessonOverride('2026-10-12', '09:00', stamp('a'));
  const b = cancelDayOverride('2026-10-15', stamp('b'));
  const c = addLessonOverride('2026-10-12', { start: '13:00', end: '14:00', subjectId: 'ig' }, stamp('c'));
  const gone: DateOverride = { ...cancelDayOverride('2026-10-20', stamp('d')), deleted: true };
  const old = cancelDayOverride('2026-10-01', stamp('e'));
  const older = cancelDayOverride('2026-09-28', stamp('f'));
  const sameTime: DateOverride[] = [
    { ...cancelLessonOverride('2026-10-12', '10:50', { id: 'y', now: a.createdAt }) },
    { ...cancelLessonOverride('2026-10-12', '10:50', { id: 'x', now: a.createdAt }) },
  ];

  it('liveOverridesOn: без удалённых и чужих дат, по времени создания (при равенстве — по id)', () => {
    const all = [c, b, ...sameTime, a, { ...a, id: 'gone', deleted: true }];
    expect(liveOverridesOn('2026-10-12', all).map((o) => o.id)).toEqual(['a', 'x', 'y', 'c']);
    expect(all[0]).toBe(c); // исходный список не переставлен
    expect(liveOverridesOn('2026-10-13', all)).toEqual([]);
  });

  it('groupOverridesByDate: впереди — по возрастанию с сегодняшнего дня, прошедшие — от недавних', () => {
    const { upcoming, past } = groupOverridesByDate([older, b, c, gone, old, a], '2026-10-12');
    expect(upcoming.map((g) => [g.date, g.overrides.map((o) => o.id)])).toEqual([
      ['2026-10-12', ['a', 'c']],
      ['2026-10-15', ['b']],
    ]);
    expect(past.map((g) => g.date)).toEqual(['2026-10-01', '2026-09-28']);
    expect(groupOverridesByDate([gone], '2026-10-12')).toEqual({ upcoming: [], past: [] });
    expect(groupOverridesByDate([a, c], '2026-10-13').past.map((g) => g.date)).toEqual(['2026-10-12']);
  });

  it('periodStatus: границы включительно', () => {
    const p = newPeriod('break', '2026-10-19', '2026-10-31', stamp(), { mainWeek: {} });
    expect(periodStatus(p, '2026-10-18')).toBe('upcoming');
    expect(periodStatus(p, '2026-10-19')).toBe('current');
    expect(periodStatus(p, '2026-10-31')).toBe('current');
    expect(periodStatus(p, '2026-11-01')).toBe('past');
    const day = { ...p, from: '2026-11-05', to: '2026-11-05' };
    expect(['2026-11-04', '2026-11-05', '2026-11-06'].map((d) => periodStatus(day, d))).toEqual(['upcoming', 'current', 'past']);
  });
});

describe('describeOverride', () => {
  const mon = '2026-10-12';

  it('отмена пары: с источниками называет предмет, без — только время', () => {
    const o = cancelLessonOverride(mon, '09:00', stamp());
    const src = sources({ overrides: [o] });
    expect(describeOverride(o, testName, src)).toBe('Отменена пара: МСС, 09:00');
    expect(describeOverride(o, testName)).toBe('Отменена пара в 09:00');
    expect(describeOverride(cancelLessonOverride(mon, '09:00', stamp(), 'болеет'), testName, src)).toBe('Отменена пара: МСС, 09:00 — болеет');
    // Пары в это время нет — подпись без предмета.
    const lost = cancelLessonOverride(mon, '15:00', stamp());
    expect(describeOverride(lost, testName, sources({ overrides: [lost] }))).toBe('Отменена пара в 15:00');
  });

  it('замена кабинета: «Замена в 11:55: История → каб. 12»', () => {
    const o = replaceLessonOverride('2026-10-15', '11:55', { room: '12' }, stamp());
    expect(describeOverride(o, realName, realSources({ overrides: [o] }))).toBe('Замена в 11:55: История → каб. 12');
    expect(describeOverride(o, realName)).toBe('Замена в 11:55: каб. 12');
  });

  it('замена предмета, времени, кабинета', () => {
    const src = sources();
    const r = (patch: Parameters<typeof replaceLessonOverride>[2], note?: string) =>
      describeOverride(replaceLessonOverride(mon, '09:00', patch, stamp(), note), testName, src);
    expect(r({ subjectId: 'ig', room: '25' })).toBe('Замена в 09:00: МСС → ИГ, каб. 25');
    expect(r({ end: '10:00' })).toBe('Замена в 09:00: МСС → 09:00–10:00');
    expect(r({ start: '09:30', end: '11:00', room: 'Спортзал' })).toBe('Замена в 09:00: МСС → 09:30–11:00, Спортзал');
    expect(r({ rooms: ['27', '25'] })).toBe('Замена в 09:00: МСС → каб. 27/25');
    expect(r({ room: '' })).toBe('Замена в 09:00: МСС → без кабинета');
    expect(r({ subjectId: 'mss', room: '27' })).toBe('Замена в 09:00: МСС'); // ничего по сути не поменялось
    expect(r({ subjectId: 'ig' }, 'заболел преподаватель')).toBe('Замена в 09:00: МСС → ИГ — заболел преподаватель');
  });

  it('замена без источников — то, что указано в замене', () => {
    const r = (patch: Parameters<typeof replaceLessonOverride>[2]) =>
      describeOverride(replaceLessonOverride(mon, '09:00', patch, stamp()), testName);
    expect(r({ subjectId: 'ig', room: '25' })).toBe('Замена в 09:00: ИГ, каб. 25');
    expect(r({ start: '09:30', end: '10:30' })).toBe('Замена в 09:00: 09:30–10:30');
    expect(r({ start: '09:30' })).toBe('Замена в 09:00: с 09:30');
    expect(r({ end: '10:00' })).toBe('Замена в 09:00: до 10:00');
    expect(r({})).toBe('Замена пары в 09:00');
  });

  it('замена добавленной пары и замена после замены — от того, какой пара была перед этим изменением', () => {
    const add = addLessonOverride(mon, { start: '13:00', end: '14:40', subjectId: 'prac' }, stamp());
    const rep = replaceLessonOverride(mon, '13:00', { room: '8' }, stamp());
    const first = replaceLessonOverride(mon, '09:00', { subjectId: 'ig' }, stamp());
    const second = replaceLessonOverride(mon, '09:00', { room: '12' }, stamp());
    const src = sources({ overrides: [second, rep, first, add] });
    expect(describeOverride(rep, testName, src)).toBe('Замена в 13:00: Практика → каб. 8');
    expect(describeOverride(first, testName, src)).toBe('Замена в 09:00: МСС → ИГ');
    expect(describeOverride(second, testName, src)).toBe('Замена в 09:00: ИГ → каб. 12');
  });

  it('добавленная пара и отмена дня', () => {
    const add = (room?: string, note?: string) =>
      describeOverride(addLessonOverride(mon, { start: '09:00', end: '14:40', subjectId: 'prac', room }, stamp(), note), testName);
    expect(add()).toBe('Добавлена пара: Практика, 09:00–14:40');
    expect(add('8')).toBe('Добавлена пара: Практика, 09:00–14:40, каб. 8');
    expect(add(undefined, 'вместо пятницы')).toBe('Добавлена пара: Практика, 09:00–14:40 — вместо пятницы');
    expect(describeOverride(cancelDayOverride(mon, stamp()), testName)).toBe('Пар нет весь день');
    expect(describeOverride(cancelDayOverride(mon, stamp(), 'День народного единства'), testName)).toBe(
      'Пар нет весь день: День народного единства',
    );
  });
});

describe('describePeriodDates', () => {
  it('один месяц, разные месяцы, один день', () => {
    expect(describePeriodDates({ from: '2026-10-19', to: '2026-10-31' })).toBe('19–31 октября');
    expect(describePeriodDates({ from: '2026-10-28', to: '2026-11-03' })).toBe('28 октября – 3 ноября');
    expect(describePeriodDates({ from: '2026-11-05', to: '2026-11-05' })).toBe('5 ноября');
    expect(describePeriodDates({ from: '2026-10-31', to: '2026-11-01' })).toBe('31 октября – 1 ноября');
  });

  it('через Новый год — без года; на год и больше — с годом', () => {
    expect(describePeriodDates({ from: '2026-12-28', to: '2027-01-10' })).toBe('28 декабря – 10 января');
    expect(describePeriodDates({ from: '2026-10-01', to: '2027-10-01' })).toBe('1 октября 2026 – 1 октября 2027');
  });

  it('пробелы — как в format.ts: обычный внутри даты, вокруг тире между месяцами', () => {
    expect(describePeriodDates({ from: '2026-10-28', to: '2026-11-03' })).not.toContain(' ');
  });
});

describe('сводка «Практики»', () => {
  it('дни недели', () => {
    expect(describeWeekdays(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('пн–пт');
    expect(describeWeekdays(['fri', 'wed', 'mon'])).toBe('пн, ср, пт');
    expect(describeWeekdays(['mon', 'tue', 'wed', 'fri'])).toBe('пн–ср, пт');
    expect(describeWeekdays(['mon', 'tue'])).toBe('пн, вт');
    expect(describeWeekdays(['sat'])).toBe('сб');
    expect(describeWeekdays([])).toBe('');
  });

  it('число занятий за период', () => {
    expect(countWeekdays('2026-10-19', '2026-10-30', ['mon', 'tue', 'wed', 'thu', 'fri'])).toBe(10);
    expect(countWeekdays('2026-10-19', '2026-10-30', ['sat'])).toBe(1);
    expect(countWeekdays('2026-10-30', '2026-10-19', ['mon'])).toBe(0);
  });

  it('«Каждый пн–пт 09:00–14:40, каб. 8 — 2 недели, 10 занятий»', () => {
    const spec: PracticeSpec = { ...defaultPracticeSpec('prac'), room: '8' };
    expect(describePractice(spec, '2026-10-19', '2026-10-30')).toBe('Каждый пн–пт 09:00–14:40, каб. 8 — 2 недели, 10 занятий');
    expect(describePractice({ ...spec, room: undefined, days: ['mon'] }, '2026-10-19', '2026-10-19')).toBe(
      'Каждый пн 09:00–14:40 — 1 день, 1 занятие',
    );
    expect(describePractice(spec, '2026-10-21', '2026-10-23')).toBe('Каждый пн–пт 09:00–14:40, каб. 8 — 3 дня, 3 занятия');
    expect(describePractice(spec, '2026-10-19', '')).toBe('Каждый пн–пт 09:00–14:40, каб. 8');
    expect(describePractice({ ...spec, days: [] }, '2026-10-19', '2026-10-30')).toBe('Не выбраны дни недели');
  });
});

describe('проверка ввода', () => {
  const ok = known(testMain);

  it('пара', () => {
    expect(validateLessonInput({ start: '09:00', end: '10:40', subjectId: 'mss', room: '27' }, ok)).toEqual([]);
    expect(validateLessonInput({ start: '09:00', subjectId: 'mss' }, ok)).toEqual(['Укажи время начала и конца']);
    expect(validateLessonInput({ start: '9:00', end: '10:40', subjectId: 'mss' }, ok)).toEqual(['Укажи время начала и конца']);
    expect(validateLessonInput({ start: '10:40', end: '09:00', subjectId: 'mss' }, ok)).toEqual([
      'Пара заканчивается раньше, чем начинается',
    ]);
    expect(validateLessonInput({ start: '09:00', end: '09:00', subjectId: 'mss' }, ok)).toEqual(['Начало и конец пары совпадают']);
    expect(validateLessonInput({ start: '09:00', end: '10:00' }, ok)).toEqual(['Выбери предмет']);
    expect(validateLessonInput({ start: '09:00', end: '10:00', subjectId: 'нет-такого' }, ok)).toEqual(['Выбери предмет']);
    expect(validateLessonInput({ start: '09:00', end: '10:00', subjectId: 'mss', rooms: ['1', 'x'.repeat(31)] }, ok)).toEqual([
      'Кабинет — не длиннее 30 символов',
    ]);
    expect(validateLessonInput({ start: '09:00', end: '10:00', subjectId: 'mss', note: 'x'.repeat(201) }, ok)).toEqual([
      'Заметка — не длиннее 200 символов',
    ]);
    expect(validateLessonInput({}, ok)).toEqual(['Укажи время начала и конца', 'Выбери предмет']);
  });

  it('пересечение пар', () => {
    expect(dayOverlaps([])).toBe(false);
    expect(dayOverlaps(real.week.thu!)).toBe(false);
    expect(dayOverlaps([{ start: '09:00', end: '10:40' }, { start: '10:40', end: '11:30' }])).toBe(false); // впритык — можно
    expect(dayOverlaps([{ start: '10:30', end: '11:30' }, { start: '09:00', end: '10:40' }])).toBe(true); // порядок не важен
    expect(dayOverlaps([{ start: '09:00', end: '14:00' }, { start: '10:00', end: '10:30' }, { start: '12:00', end: '13:00' }])).toBe(true);
    expect(dayOverlaps([{ start: '09:00', end: '10:00' }, { start: 'xx', end: '10:30' }])).toBe(false);
  });

  it('временное расписание', () => {
    const good = { title: 'Сессия', from: '2026-10-19', to: '2026-10-31', week: copyWeek(testMain.week) };
    expect(validatePeriodInput(good, ok)).toEqual([]);
    expect(validatePeriodInput({ ...good, title: '  ' }, ok)).toEqual(['Введи название']);
    expect(validatePeriodInput({ ...good, title: 'x'.repeat(61) }, ok)).toEqual(['Название — не длиннее 60 символов']);
    expect(validatePeriodInput({ ...good, title: 'x'.repeat(60) }, ok)).toEqual([]);
    expect(validatePeriodInput({ ...good, from: '' }, ok)).toEqual(['Укажи даты «с» и «по»']);
    expect(validatePeriodInput({ ...good, to: '2026-02-30' }, ok)).toEqual(['Укажи даты «с» и «по»']);
    expect(validatePeriodInput({ ...good, to: '2026-10-18' }, ok)).toEqual(['Дата «по» раньше даты «с»']);
    expect(validatePeriodInput({ ...good, to: '2026-10-19' }, ok)).toEqual([]); // один день
    expect(validatePeriodInput({ ...good, from: '2026-10-19', to: '2027-10-19' }, ok)).toEqual([]); // 366 дней
    expect(validatePeriodInput({ ...good, from: '2026-10-19', to: '2027-10-20' }, ok)).toEqual(['Период длиннее года']);
  });

  it('временное расписание: ошибки в парах и пересечения по дням', () => {
    const week = copyWeek(testMain.week);
    week.mon![1].subjectId = '';
    week.tue = [
      { start: '09:00', end: '10:40', subjectId: 'mss' },
      { start: '10:00', end: '11:00', subjectId: 'ig' },
    ];
    week.fri![0].end = '12:00';
    expect(validatePeriodInput({ title: 'Сессия', from: '2026-10-19', to: '2026-10-31', week }, known(testMain))).toEqual([
      'Понедельник, пара 2: выбери предмет',
      'Пары во вторник накладываются по времени',
      'Пятница, пара 1: пара заканчивается раньше, чем начинается',
    ]);
  });

  it('шаблон «Практика»', () => {
    expect(validatePracticeInput(defaultPracticeSpec('prac'), known(testMain))).toEqual([]);
    expect(validatePracticeInput({ ...defaultPracticeSpec(), days: [] }, known(testMain))).toEqual([
      'Выбери предмет',
      'Выбери хотя бы один день недели',
    ]);
  });
});
