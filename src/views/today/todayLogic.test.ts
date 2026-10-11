import { describe, expect, it } from 'vitest';
import scheduleJson from '../../../data/schedule.json';
import { holidayMarkOverride, holidayOn } from '../../core/holidays';
import { resolveDay, type MainSchedule, type ScheduleSources } from '../../core/schedule';
import { override, sources } from '../../core/testData';
import { cancelledDayInfo, holidayDateLabel, upcomingHoliday } from './todayLogic';

const real = scheduleJson as MainSchedule;
const src = (extra: Partial<ScheduleSources> = {}): ScheduleSources => ({ main: real, periods: [], overrides: [], ...extra });

describe('карточка праздника на «Сегодня»', () => {
  it('4 ноября — за неделю до праздника, за 14 дней включительно, но не раньше', () => {
    expect(upcomingHoliday('2026-10-28', src(), [])?.date).toBe('2026-11-04');
    expect(upcomingHoliday('2026-10-21', src(), [])?.name).toBe('День народного единства');
    expect(upcomingHoliday('2026-10-20', src(), [])).toBeNull();
    expect(upcomingHoliday('2026-10-10', src(), [])).toBeNull();
  });

  it('в сам праздник с парами карточка ещё есть, назавтра — нет', () => {
    expect(upcomingHoliday('2026-11-04', src(), [])?.date).toBe('2026-11-04');
    expect(upcomingHoliday('2026-11-05', src(), [])).toBeNull();
  });

  it('«Не сейчас» и уже отмеченный выходной прячут карточку', () => {
    expect(upcomingHoliday('2026-10-28', src(), ['2026-11-04'])).toBeNull();
    const mark = holidayMarkOverride(holidayOn('2026-11-04')!, { id: 'm1', now: '2026-10-28T07:00:00.000Z' });
    expect(upcomingHoliday('2026-10-28', src({ overrides: [mark] }), [])).toBeNull();
  });
});

describe('почему пар нет', () => {
  it('отмеченный праздник — его название и конфетти', () => {
    const mark = holidayMarkOverride(holidayOn('2026-11-04')!, { id: 'm1', now: '2026-10-28T07:00:00.000Z' });
    expect(cancelledDayInfo(resolveDay('2026-11-04', src({ overrides: [mark] })))).toEqual({
      note: 'День народного единства',
      holiday: true,
    });
  });

  it('выходной без причины в праздник — тоже название праздника', () => {
    const dayOff = override({ date: '2026-11-04', action: 'cancelDay' });
    expect(cancelledDayInfo(resolveDay('2026-11-04', src({ overrides: [dayOff] })))).toEqual({
      note: 'День народного единства',
      holiday: true,
    });
  });

  it('свой выходной: своя причина или ничего', () => {
    const withNote = override({ date: '2026-10-12', action: 'cancelDay', note: ' Субботник ' });
    expect(cancelledDayInfo(resolveDay('2026-10-12', sources({ overrides: [withNote] })))).toEqual({ note: 'Субботник', holiday: false });
    const bare = override({ date: '2026-10-12', action: 'cancelDay' });
    expect(cancelledDayInfo(resolveDay('2026-10-12', sources({ overrides: [bare] })))).toEqual({ holiday: false });
  });

  it('пары отменили по одной: общая причина, если она у всех одна', () => {
    const a = override({ date: '2026-10-12', action: 'cancel', target: '09:00', note: 'болеет преподаватель' });
    const b = override({ date: '2026-10-12', action: 'cancel', target: '10:50', note: 'болеет преподаватель' });
    const c = override({ date: '2026-10-12', action: 'cancel', target: '10:50', note: 'другое' });
    const d = override({ date: '2026-10-12', action: 'cancel', target: '10:50' });
    expect(cancelledDayInfo(resolveDay('2026-10-12', sources({ overrides: [a, b] })))).toEqual({
      note: 'болеет преподаватель',
      holiday: false,
    });
    expect(cancelledDayInfo(resolveDay('2026-10-12', sources({ overrides: [a, c] })))).toEqual({ holiday: false });
    expect(cancelledDayInfo(resolveDay('2026-10-12', sources({ overrides: [a, d] })))).toEqual({ holiday: false });
  });
});

describe('дата на карточке праздника', () => {
  it('сегодня и завтра — относительным словом, дальше — с днём недели', () => {
    expect(holidayDateLabel('2026-11-04', '2026-11-04')).toBe('Сегодня, 4 ноября');
    expect(holidayDateLabel('2026-11-04', '2026-11-03')).toBe('Завтра, 4 ноября');
    expect(holidayDateLabel('2026-11-04', '2026-11-02')).toBe('4 ноября, среда');
    expect(holidayDateLabel('2026-11-04', '2026-10-28')).toBe('4 ноября, среда');
  });
});
