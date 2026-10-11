import { describe, expect, it } from 'vitest';
import scheduleJson from '../../data/schedule.json';
import { addLessonOverride, cancelDayOverride, cancelLessonOverride, newPeriod, type Stamp } from './changes';
import {
  describeHoliday,
  holidayMarkOverride,
  holidayOn,
  holidayRows,
  holidaySuggestions,
  isHolidayMark,
  russianHolidays,
} from './holidays';
import type { DateOverride, MainSchedule, ScheduleSources } from './schedule';
import { weekdayKey } from './time';

const real = scheduleJson as MainSchedule;
const src = (extra: Partial<ScheduleSources> = {}): ScheduleSources => ({ main: real, periods: [], overrides: [], ...extra });

let n = 0;
function stamp(): Stamp {
  n++;
  return { id: `h${n}`, now: new Date(Date.UTC(2026, 9, 1, 7, 0, n)).toISOString() };
}

const brief = (list: { date: string; name: string }[]) => list.map((h) => `${h.date} ${weekdayKey(h.date)} ${h.name}`);

describe('russianHolidays', () => {
  it('октябрь 2026 – декабрь 2027', () => {
    expect(brief(russianHolidays('2026-10-01', '2027-12-31'))).toEqual([
      '2026-11-04 wed День народного единства',
      '2027-01-01 fri Новогодние каникулы',
      '2027-01-02 sat Новогодние каникулы',
      '2027-01-03 sun Новогодние каникулы',
      '2027-01-04 mon Новогодние каникулы',
      '2027-01-05 tue Новогодние каникулы',
      '2027-01-06 wed Новогодние каникулы',
      '2027-01-07 thu Рождество Христово',
      '2027-01-08 fri Новогодние каникулы',
      '2027-02-23 tue День защитника Отечества',
      '2027-03-08 mon Международный женский день',
      '2027-05-01 sat Праздник Весны и Труда',
      '2027-05-03 mon Перенос выходного (Праздник Весны и Труда)',
      '2027-05-09 sun День Победы',
      '2027-05-10 mon Перенос выходного (День Победы)',
      '2027-06-12 sat День России',
      '2027-06-14 mon Перенос выходного (День России)',
      '2027-11-04 thu День народного единства',
    ]);
  });

  it('перенос помнит, с какого праздника он', () => {
    const list = russianHolidays('2027-05-01', '2027-06-30');
    expect(list.find((h) => h.date === '2027-05-03')?.transferredFrom).toBe('2027-05-01');
    expect(list.find((h) => h.date === '2027-05-10')?.transferredFrom).toBe('2027-05-09');
    expect(list.find((h) => h.date === '2027-06-14')?.transferredFrom).toBe('2027-06-12');
    expect(list.find((h) => h.date === '2027-05-01')?.transferredFrom).toBeUndefined();
  });

  it('январские выходные не переносим: их каждый год объявляет правительство', () => {
    expect(russianHolidays('2027-01-01', '2027-01-31').every((h) => !h.transferredFrom)).toBe(true);
    expect(russianHolidays('2028-01-01', '2028-01-31').every((h) => !h.transferredFrom)).toBe(true); // 1–2 января 2028 — сб, вс
  });

  it('другие годы: 8 марта и 9 мая 2026 — в выходной, 4 ноября 2028 — суббота', () => {
    expect(brief(russianHolidays('2026-03-08', '2026-03-09'))).toEqual([
      '2026-03-08 sun Международный женский день',
      '2026-03-09 mon Перенос выходного (Международный женский день)',
    ]);
    expect(russianHolidays('2026-05-11', '2026-05-11')[0]).toEqual({
      date: '2026-05-11',
      name: 'Перенос выходного (День Победы)',
      transferredFrom: '2026-05-09',
    });
    expect(brief(russianHolidays('2028-11-01', '2028-11-30'))).toEqual([
      '2028-11-04 sat День народного единства',
      '2028-11-06 mon Перенос выходного (День народного единства)',
    ]);
  });

  it('перенос, у которого праздник раньше начала промежутка, тоже попадает', () => {
    expect(brief(russianHolidays('2027-05-02', '2027-05-04'))).toEqual(['2027-05-03 mon Перенос выходного (Праздник Весны и Труда)']);
  });

  it('пустой и неверный промежуток', () => {
    expect(russianHolidays('2026-10-01', '2026-10-31')).toEqual([]);
    expect(russianHolidays('2027-01-10', '2027-01-01')).toEqual([]);
    expect(russianHolidays('мусор', '2027-01-01')).toEqual([]);
  });

  it('результат можно менять — кеш года не портится', () => {
    russianHolidays('2026-11-04', '2026-11-04')[0].name = 'испорчено';
    expect(holidayOn('2026-11-04')?.name).toBe('День народного единства');
    expect(holidayOn('2026-11-05')).toBeUndefined();
  });
});

describe('holidaySuggestions', () => {
  const today = '2026-10-10';
  const dates = (s: ScheduleSources, days?: number) => holidaySuggestions(today, s, days).map((h) => h.date);

  it('настоящее расписание (пары пн–пт): только праздники, выпавшие на учебные дни, на год вперёд', () => {
    expect(dates(src())).toEqual([
      '2026-11-04',
      '2027-01-01',
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
      '2027-01-07',
      '2027-01-08',
      '2027-02-23',
      '2027-03-08',
      '2027-05-03',
      '2027-05-10',
      '2027-06-14',
    ]);
  });

  it('промежуток: по умолчанию 366 дней, границы включительно', () => {
    expect(dates(src(), 30)).toEqual(['2026-11-04']);
    expect(dates(src(), 25)).toEqual(['2026-11-04']); // 10 октября + 25 дней = 4 ноября
    expect(dates(src(), 24)).toEqual([]);
    expect(holidaySuggestions('2026-11-04', src(), 0).map((h) => h.date)).toEqual(['2026-11-04']);
    expect(holidaySuggestions('2027-11-01', src()).map((h) => h.date)[0]).toBe('2027-11-04');
  });

  it('уже отмеченный выходной не предлагаем; удалённую отметку — снова предлагаем', () => {
    const mark = cancelDayOverride('2026-11-04', stamp(), 'День народного единства');
    expect(dates(src({ overrides: [mark] }), 30)).toEqual([]);
    expect(dates(src({ overrides: [{ ...mark, deleted: true }] }), 30)).toEqual(['2026-11-04']);
    // Свой выходной без причины — тоже уже отмечен.
    expect(dates(src({ overrides: [cancelDayOverride('2026-11-04', stamp())] }), 30)).toEqual([]);
    // После отмены дня добавили пару — день всё равно уже отмечен.
    const later = addLessonOverride('2026-11-04', { start: '10:00', end: '11:00', subjectId: 'mss' }, stamp());
    expect(dates(src({ overrides: [mark, later] }), 30)).toEqual([]);
  });

  it('отменили одну пару — остальные идут, праздник предлагаем; отменили все по одной — нет', () => {
    const one = cancelLessonOverride('2026-11-04', '09:00', stamp());
    expect(dates(src({ overrides: [one] }), 30)).toEqual(['2026-11-04']);
    const all = (real.week.wed ?? []).map((l) => cancelLessonOverride('2026-11-04', l.start, stamp()));
    expect(dates(src({ overrides: all }), 30)).toEqual([]);
  });

  it('учитывает временное расписание: каникулы на Новый год убирают январские дни', () => {
    const winter = newPeriod('break', '2026-12-29', '2027-01-11', stamp(), { mainWeek: real.week });
    expect(dates(src({ periods: [winter] }))).not.toContain('2027-01-04');
    expect(dates(src({ periods: [winter] }))[1]).toBe('2027-02-23');
  });

  it('праздник в субботу предлагаем, если в этот день добавили пару', () => {
    const add = addLessonOverride('2027-05-01', { start: '09:00', end: '12:00', subjectId: 'mss' }, stamp());
    expect(dates(src({ overrides: [add] }))).toContain('2027-05-01');
  });
});

describe('holidayRows', () => {
  it('неотмеченные и уже отмеченные праздники вместе, по дате; свой выходной в праздник — не показываем', () => {
    const marked = holidayMarkOverride({ date: '2027-01-04', name: 'Новогодние каникулы' }, stamp());
    const own = cancelDayOverride('2027-01-05', stamp(), 'Сессия');
    const gone = { ...holidayMarkOverride({ date: '2027-01-06', name: 'Новогодние каникулы' }, stamp()), deleted: true };
    const rows = holidayRows('2026-12-01', src({ overrides: [own, marked, gone] }), 40);
    expect(rows.map((r) => `${r.holiday.date} ${r.mark ? 'отмечен' : '—'}`)).toEqual([
      '2027-01-01 —',
      '2027-01-04 отмечен',
      '2027-01-06 —',
      '2027-01-07 —',
      '2027-01-08 —',
    ]);
    expect(rows[1].mark).toBe(marked);
    expect(holidayRows('2026-10-10', src(), 30).map((r) => r.holiday.date)).toEqual(['2026-11-04']);
  });
});

describe('отметка праздника', () => {
  const h = { date: '2026-11-04', name: 'День народного единства' };

  it('holidayMarkOverride — «Пар нет весь день» с названием праздника', () => {
    const o = holidayMarkOverride(h, stamp());
    expect(o).toMatchObject({ action: 'cancelDay', date: '2026-11-04', note: 'День народного единства' });
    expect(isHolidayMark(o)).toBe(true);
  });

  it('isHolidayMark отличает праздник от своего выходного', () => {
    const day = (date: string, note?: string) => cancelDayOverride(date, stamp(), note);
    expect(isHolidayMark(day('2026-11-04', ' День народного единства '))).toBe(true);
    expect(isHolidayMark(day('2027-05-10', 'Перенос выходного (День Победы)'))).toBe(true);
    expect(isHolidayMark(day('2026-11-04'))).toBe(false);
    expect(isHolidayMark(day('2026-11-04', 'Отключили свет'))).toBe(false);
    expect(isHolidayMark(day('2026-11-05', 'День народного единства'))).toBe(false);
    const cancel: DateOverride = { ...cancelLessonOverride('2026-11-04', '09:00', stamp()), note: 'День народного единства' };
    expect(isHolidayMark(cancel)).toBe(false);
  });

  it('подпись для списка и карточки', () => {
    expect(describeHoliday(h)).toBe('4 ноября, среда — День народного единства');
    expect(describeHoliday({ date: '2027-05-03', name: 'Перенос выходного (Праздник Весны и Труда)' })).toBe(
      '3 мая, понедельник — Перенос выходного (Праздник Весны и Труда)',
    );
  });
});
