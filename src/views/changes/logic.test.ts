import { describe, expect, it } from 'vitest';
import scheduleJson from '../../../data/schedule.json';
import { addLessonOverride, cancelDayOverride, cancelLessonOverride, replaceLessonOverride, type Stamp } from '../../core/changes';
import { holidayOn } from '../../core/holidays';
import { resolveDay, type DateOverride, type MainSchedule, type ResolvedLesson, type ScheduleSources } from '../../core/schedule';
import {
  DAYS_OFF_MAX,
  findTraced,
  planAddLesson,
  planDayOff,
  planDayOffNote,
  planDaysOff,
  planEditLesson,
  planMarkHolidays,
  planRemoveAdded,
  planResetDay,
  planRevert,
  planToggleCancel,
  planUnmarkHolidays,
  schoolDaysCount,
  traceDay,
  type Plan,
} from './logic';

// Настоящее расписание: 2026-10-12 — понедельник, 2026-10-15 — четверг (ИГ с кабинетами 27/25 по подгруппам).
const main = scheduleJson as MainSchedule;
const MON = '2026-10-12';
const THU = '2026-10-15';

let n = 0;
/** Каждая следующая метка создана позже предыдущей. */
const stamp = (): Stamp => {
  n++;
  return { id: `s${n}`, now: new Date(Date.UTC(2026, 9, 1, 7, 0, 0, n)).toISOString() };
};

const src = (overrides: DateOverride[] = []): ScheduleSources => ({ main, periods: [], overrides });

/** Применить план, как это сделает хранилище: удалённые помечаются deleted, сохранённые заменяются по id. */
function apply(s: ScheduleSources, plan: Plan): ScheduleSources {
  const byId = new Map(s.overrides.map((o) => [o.id, o]));
  for (const id of plan.remove) {
    const o = byId.get(id);
    if (o) byId.set(id, { ...o, deleted: true });
  }
  for (const o of plan.save) byId.set(o.id, { ...o, createdAt: byId.get(o.id)?.createdAt ?? o.createdAt });
  return { ...s, overrides: [...byId.values()] };
}

const brief = (date: string, s: ScheduleSources) =>
  resolveDay(date, s).lessons.map((l) => `${l.start} ${l.subjectId} ${l.status}${l.room !== undefined ? ` ${l.room}` : ''}`);

const lessonAt = (date: string, s: ScheduleSources, start: string): ResolvedLesson => {
  const l = resolveDay(date, s).lessons.find((x) => x.start === start);
  if (!l) throw new Error(`нет пары в ${start}`);
  return l;
};

const input = (l: ResolvedLesson, patch: Partial<{ subjectId: string; start: string; end: string; room: string }> = {}) => ({
  subjectId: l.subjectId,
  start: l.start,
  end: l.end,
  room: l.room ?? l.rooms?.[0] ?? '',
  ...patch,
});

describe('traceDay совпадает с resolveDay', () => {
  it('отмена, замена, добавленная пара, «пар нет», не нашедшееся изменение', () => {
    const overrides = [
      replaceLessonOverride(MON, '10:50', { subjectId: 'history', room: '6' }, stamp()),
      cancelLessonOverride(MON, '09:00', stamp(), 'болеет'),
      addLessonOverride(MON, { start: '17:00', end: '18:00', subjectId: 'pe' }, stamp()),
      cancelLessonOverride(MON, '08:00', stamp()),
    ];
    for (const s of [src(overrides), src([...overrides, cancelDayOverride(MON, stamp(), 'выходной')])]) {
      const day = resolveDay(MON, s);
      const traced = traceDay(MON, s);
      expect(traced.lessons.map((t) => t.lesson)).toEqual(day.lessons);
      expect(traced.unmatched.map((o) => o.id)).toEqual(day.unmatched.map((o) => o.id));
      expect(traced.lessons.every((t) => findTraced(traced, t.lesson) === t)).toBe(true);
    }
  });

  it('у пар постоянные ключи: base:N для расписания, add:<id> для добавленных', () => {
    const add = addLessonOverride(MON, { start: '08:00', end: '08:45', subjectId: 'pe' }, stamp());
    const t = traceDay(MON, src([add]));
    expect(t.lessons.map((x) => x.key)).toEqual([`add:${add.id}`, 'base:0', 'base:1', 'base:2', 'base:3', 'base:4']);
    expect(t.lessons[0].addId).toBe(add.id);
  });
});

describe('отменить и вернуть пару', () => {
  it('отмена — одно изменение «cancel» на время начала', () => {
    const plan = planToggleCancel(MON, lessonAt(MON, src(), '10:50'), src(), stamp)!;
    expect(plan.text).toBe('Пара отменена');
    expect(plan.save).toMatchObject([{ action: 'cancel', target: '10:50', date: MON }]);
    expect(brief(MON, apply(src(), plan))[1]).toBe('10:50 pfo cancelled 27');
  });

  it('вернуть отменённую — удалить её отмену', () => {
    const cancel = cancelLessonOverride(MON, '10:50', stamp());
    const s = src([cancel]);
    const plan = planToggleCancel(MON, lessonAt(MON, s, '10:50'), s, stamp)!;
    expect(plan).toEqual({ save: [], remove: [cancel.id], text: 'Пара возвращена' });
  });

  it('добавленную пару «отменить» — значит удалить её вместе с её заменами', () => {
    const add = addLessonOverride(MON, { start: '17:00', end: '18:00', subjectId: 'pe' }, stamp());
    const fix = replaceLessonOverride(MON, '17:00', { room: '3' }, stamp());
    const s = src([add, fix]);
    const plan = planToggleCancel(MON, lessonAt(MON, s, '17:00'), s, stamp)!;
    expect(plan.text).toBe('Пара удалена');
    expect(plan.remove).toEqual([add.id, fix.id]);
    expect(brief(MON, apply(s, plan))).toHaveLength(5);
  });

  it('в день «пар нет» вернуть одну пару: отметка снимается, остальные отменяются по одной с той же причиной', () => {
    const off = cancelDayOverride(MON, stamp(), 'субботник');
    const s = src([off]);
    const plan = planToggleCancel(MON, lessonAt(MON, s, '13:00'), s, stamp)!;
    expect(plan.text).toBe('Пара возвращена');
    expect(plan.remove).toEqual([off.id]);
    expect(plan.save).toHaveLength(4);
    expect(plan.save.every((o) => o.action === 'cancel' && o.note === 'субботник')).toBe(true);
    const after = resolveDay(MON, apply(s, plan));
    expect(after.lessons.map((l) => `${l.start} ${l.status}`)).toEqual([
      '09:00 cancelled',
      '10:50 cancelled',
      '13:00 normal',
      '14:50 cancelled',
      '15:45 cancelled',
    ]);
  });

  it('пару, которую уже поменяли в другом месте, найти нельзя — null', () => {
    const stale = lessonAt(MON, src(), '10:50');
    const s = src([replaceLessonOverride(MON, '10:50', { room: '12' }, stamp())]);
    expect(planToggleCancel(MON, stale, s, stamp)).toBeNull();
  });

  it('замену можно убрать — пара снова как по расписанию', () => {
    const r = replaceLessonOverride(MON, '10:50', { room: '12' }, stamp());
    const s = src([r]);
    const day = traceDay(MON, s);
    const t = findTraced(day, lessonAt(MON, s, '10:50'))!;
    expect(planRevert(t, day)).toEqual({ save: [], remove: [r.id], text: 'Замена убрана' });
    expect(planRevert(traceDay(MON, src()).lessons[0], traceDay(MON, src()))).toBeNull();
  });
});

describe('заменить пару', () => {
  it('в замене — только то, что поменяли', () => {
    const l = lessonAt(MON, src(), '10:50');
    const plan = planEditLesson(MON, l, input(l, { subjectId: 'history', room: '6' }), '', src(), 1, stamp)!;
    expect(plan.text).toBe('Пара заменена');
    expect(plan.save).toMatchObject([{ action: 'replace', target: '10:50', lesson: { subjectId: 'history', room: '6' } }]);
    expect(Object.keys((plan.save[0] as { lesson: object }).lesson).sort()).toEqual(['room', 'subjectId']);
  });

  it('ничего не поменяли — изменений нет', () => {
    const l = lessonAt(MON, src(), '10:50');
    expect(planEditLesson(MON, l, input(l), '', src(), 1, stamp)).toBeNull();
  });

  it('повторная правка исправляет ту же замену, а вернули всё как было — замена удаляется', () => {
    const l = lessonAt(MON, src(), '10:50');
    const first = planEditLesson(MON, l, input(l, { room: '12' }), '', src(), 1, stamp)!;
    const s1 = apply(src(), first);
    const changed = lessonAt(MON, s1, '10:50');
    expect(changed.status).toBe('changed');

    const second = planEditLesson(MON, changed, input(changed, { room: '14' }), 'перенос', s1, 1, stamp)!;
    expect(second.text).toBe('Замена сохранена');
    expect(second.save).toHaveLength(1);
    expect(second.save[0].id).toBe(first.save[0].id);
    expect(second.save[0]).toMatchObject({ note: 'перенос', lesson: { room: '14' } });
    const s2 = apply(s1, second);
    expect(brief(MON, s2)[1]).toBe('10:50 pfo changed 14');

    const back = planEditLesson(MON, lessonAt(MON, s2, '10:50'), input(l), '', s2, 1, stamp)!;
    expect(back).toEqual({ save: [], remove: [first.save[0].id], text: 'Замена убрана' });
  });

  it('кабинеты по подгруппам: не трогали — в замене их нет; поменяли — общий кабинет для обеих подгрупп', () => {
    const ig = lessonAt(THU, src(), '09:00');
    expect(ig.rooms).toEqual(['27', '25']);
    // 2-я подгруппа видит в поле «25».
    const sameRoom = planEditLesson(THU, ig, { ...input(ig), room: '25', subjectId: 'history' }, '', src(), 2, stamp)!;
    expect((sameRoom.save[0] as { lesson: object }).lesson).toEqual({ subjectId: 'history' });

    const moved = planEditLesson(THU, ig, { ...input(ig), room: '12' }, '', src(), 2, stamp)!;
    const s = apply(src(), moved);
    const after = lessonAt(THU, s, '09:00');
    expect(after.room).toBe('12');
    expect(after.rooms).toBeUndefined();
  });

  it('добавленная пара правится прямо в своём изменении', () => {
    const add = addLessonOverride(MON, { start: '17:00', end: '18:00', subjectId: 'pe', room: '3' }, stamp(), 'вместо пятницы');
    const s = src([add]);
    const l = lessonAt(MON, s, '17:00');
    const plan = planEditLesson(MON, l, input(l, { end: '18:30', room: '' }), 'перенос', s, 1, stamp)!;
    expect(plan.text).toBe('Пара изменена');
    expect(plan.save).toEqual([{ ...add, note: 'перенос', lesson: { start: '17:00', end: '18:30', subjectId: 'pe' } }]);
    expect(planEditLesson(MON, l, input(l), 'вместо пятницы', s, 1, stamp)).toBeNull();
  });

  it('«заменить» отменённую пару — добавить новую', () => {
    const cancel = cancelLessonOverride(MON, '10:50', stamp());
    const s = src([cancel]);
    const l = lessonAt(MON, s, '10:50');
    const plan = planEditLesson(MON, l, input(l, { subjectId: 'history' }), '', s, 1, stamp)!;
    expect(plan.text).toBe('Пара добавлена');
    expect(plan.save).toMatchObject([{ action: 'add', lesson: { start: '10:50', subjectId: 'history', room: '27' } }]);
  });

  it('добавить пару: пустой кабинет не сохраняется, причина — без пробелов', () => {
    const plan = planAddLesson(MON, { subjectId: 'pe', start: '17:00', end: '18:00', room: '  ' }, '  перенос ', stamp);
    expect(plan.save[0]).toMatchObject({ action: 'add', note: 'перенос', lesson: { start: '17:00', end: '18:00', subjectId: 'pe' } });
    expect((plan.save[0] as { lesson: object }).lesson).not.toHaveProperty('room');
  });

  it('удалить добавленную пару; у обычной пары удалять нечего', () => {
    const add = addLessonOverride(MON, { start: '17:00', end: '18:00', subjectId: 'pe' }, stamp());
    const day = traceDay(MON, src([add]));
    const t = day.lessons.find((x) => x.addId)!;
    expect(planRemoveAdded(t, day)).toEqual({ save: [], remove: [add.id], text: 'Пара удалена' });
    expect(planRemoveAdded(day.lessons[0], day)).toBeNull();
  });
});

describe('весь день', () => {
  it('«Пар нет весь день» включить и выключить', () => {
    const on = planDayOff(MON, true, '', src(), stamp)!;
    expect(on.text).toBe('Пары на весь день отменены');
    expect(on.save).toMatchObject([{ action: 'cancelDay', date: MON }]);
    expect(on.save[0]).not.toHaveProperty('note');
    const s = apply(src(), on);
    expect(planDayOff(MON, true, '', s, stamp)).toBeNull();
    expect(planDayOff(MON, false, '', s, stamp)).toEqual({ save: [], remove: [on.save[0].id], text: 'Пары возвращены' });
    expect(planDayOff(MON, false, '', src(), stamp)).toBeNull();
  });

  it('в праздник причина по умолчанию — его название (так отметка видна в «Праздниках»)', () => {
    expect(holidayOn('2026-11-04')?.name).toBe('День народного единства');
    expect(planDayOff('2026-11-04', true, '', src(), stamp)!.save[0].note).toBe('День народного единства');
    expect(planDayOff('2026-11-04', true, 'Отгул', src(), stamp)!.save[0].note).toBe('Отгул');
  });

  it('причину можно поменять и убрать', () => {
    const off = cancelDayOverride(MON, stamp(), 'субботник');
    const s = src([off]);
    expect(planDayOffNote(MON, 'субботник ', s)).toBeNull();
    expect(planDayOffNote(MON, 'выходной', s)).toEqual({ save: [{ ...off, note: 'выходной' }], remove: [], text: 'Причина сохранена' });
    const cleared = planDayOffNote(MON, ' ', s)!;
    expect(cleared.text).toBe('Причина убрана');
    expect(cleared.save[0]).not.toHaveProperty('note');
    expect(planDayOffNote(MON, 'выходной', src())).toBeNull();
  });

  it('сбросить изменения дня — удалить все действующие на эту дату', () => {
    const a = cancelLessonOverride(MON, '09:00', stamp());
    const b = replaceLessonOverride(MON, '10:50', { room: '12' }, stamp());
    const other = cancelLessonOverride(THU, '09:00', stamp());
    const plan = planResetDay(MON, src([a, b, other, { ...cancelLessonOverride(MON, '13:00', stamp()), deleted: true }]))!;
    expect(plan.remove).toEqual([a.id, b.id]);
    expect(planResetDay(MON, src([other]))).toBeNull();
  });
});

describe('«Выходной день» на несколько дней', () => {
  it('отмечаются только дни с парами; праздник получает своё название', () => {
    // 2026-11-02 (пн) … 2026-11-08 (вс): 4 ноября — праздник.
    const result = planDaysOff('2026-11-02', '2026-11-08', '', src(), stamp);
    if (!('plan' in result)) throw new Error(result.error);
    expect(result.plan.save.map((o) => o.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(result.plan.save.map((o) => o.note)).toEqual([undefined, undefined, 'День народного единства', undefined, undefined]);
    expect(result.plan.text).toBe('Отмечено выходных: 5');
    expect(schoolDaysCount('2026-11-02', '2026-11-08', src())).toBe(5);
  });

  it('один день: «12 октября — выходной»; своя причина — у каждого дня', () => {
    const one = planDaysOff(MON, MON, ' отгул ', src(), stamp);
    if (!('plan' in one)) throw new Error(one.error);
    expect(one.plan.text).toBe('12 октября — выходной');
    expect(one.plan.save[0].note).toBe('отгул');
  });

  it('уже отмеченные дни и дни без пар пропускаются', () => {
    const s = src([cancelDayOverride(MON, stamp())]);
    const result = planDaysOff(MON, '2026-10-13', '', s, stamp);
    if (!('plan' in result)) throw new Error(result.error);
    expect(result.plan.save.map((o) => o.date)).toEqual(['2026-10-13']);
    expect(planDaysOff('2026-10-17', '2026-10-18', '', src(), stamp)).toEqual({ error: 'В эти дни пар и так нет' });
    expect(planDaysOff(MON, MON, '', s, stamp)).toEqual({ error: 'В этот день пар и так нет' });
    expect(schoolDaysCount(MON, '2026-10-13', s)).toBe(1);
  });

  it('ошибки: даты не по порядку, слишком длинный промежуток', () => {
    expect(planDaysOff('2026-10-13', MON, '', src(), stamp)).toEqual({ error: 'Дата «по» раньше даты «с»' });
    expect(planDaysOff('', MON, '', src(), stamp)).toEqual({ error: 'Укажи дату' });
    const long = planDaysOff(MON, '2026-11-12', '', src(), stamp);
    expect('error' in long && long.error).toMatch(/каникулы/);
    expect('plan' in planDaysOff(MON, '2026-11-11', '', src(), stamp)).toBe(true); // ровно DAYS_OFF_MAX дней
    expect(DAYS_OFF_MAX).toBe(31);
    expect(schoolDaysCount(MON, '2026-11-12', src())).toBe(0);
  });
});

describe('праздники', () => {
  it('отметить один или несколько; снять отметки', () => {
    const h = [
      { date: '2026-11-04', name: 'День народного единства' },
      { date: '2027-02-23', name: 'День защитника Отечества' },
    ];
    const one = planMarkHolidays(h.slice(0, 1), stamp)!;
    expect(one.text).toBe('4 ноября — выходной');
    expect(one.save).toMatchObject([{ action: 'cancelDay', date: '2026-11-04', note: 'День народного единства' }]);
    expect(planMarkHolidays(h, stamp)!.text).toBe('Отмечено 2 праздника');
    expect(planMarkHolidays([], stamp)).toBeNull();
    expect(planUnmarkHolidays(one.save)).toEqual({ save: [], remove: [one.save[0].id], text: 'Отметка снята' });
    expect(planUnmarkHolidays([])).toBeNull();
  });
});
