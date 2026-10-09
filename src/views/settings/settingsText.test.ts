import { describe, expect, it } from 'vitest';
import { mainSchedule } from '../../data/schedule';
import type { MainSchedule } from '../../core/schedule';
import {
  daySummary, formatBuildTime, genitive, offlineLabel, persistedLabel, scheduleDays, subgroupRoomsNote, subjectsWithSubgroupRooms,
} from './settingsText';

describe('подписи настроек', () => {
  it('сводка дня: число пар и время от первой до последней', () => {
    const mon = scheduleDays(mainSchedule).find((d) => d.key === 'mon')!;
    expect(daySummary(mon.lessons)).toBe('5 пар · 09:00–16:30');
    expect(daySummary([{ start: '10:50', end: '12:40', subjectId: 'a' }])).toBe('1 пара · 10:50–12:40');
    expect(daySummary([])).toBe('Пар нет');
  });

  it('дни без пар пропускаются, пары по времени', () => {
    const main: MainSchedule = {
      version: 1,
      subjects: [],
      week: {
        tue: [
          { start: '13:00', end: '14:40', subjectId: 'b' },
          { start: '09:00', end: '10:40', subjectId: 'a' },
        ],
        wed: [],
      },
    };
    const days = scheduleDays(main);
    expect(days.map((d) => d.key)).toEqual(['tue']);
    expect(days[0].lessons.map((l) => l.start)).toEqual(['09:00', '13:00']);
    expect(daySummary(days[0].lessons)).toBe('2 пары · 09:00–14:40');
  });

  it('предметы с разными кабинетами по подгруппам — из расписания', () => {
    expect(subjectsWithSubgroupRooms(mainSchedule)).toEqual(['ig', 'pe', 'lang']);
    const same: MainSchedule = {
      version: 1,
      subjects: [{ id: 'a', short: 'А', full: 'А' }],
      week: { mon: [{ start: '09:00', end: '10:00', subjectId: 'a', rooms: ['5', '5'] }] },
    };
    expect(subjectsWithSubgroupRooms(same)).toEqual([]);
  });

  it('родительный падеж сокращений', () => {
    expect(genitive('ИГ')).toBe('ИГ');
    expect(genitive('МДК 04.01')).toBe('МДК 04.01');
    expect(genitive('Факульт.')).toBe('Факульт.');
    expect(genitive('Физра')).toBe('Физры');
    expect(genitive('Ин. яз')).toBe('Ин. яза');
    expect(genitive('Матвед')).toBe('Матведа');
    expect(genitive('История')).toBe('Истории');
    expect(genitive('Информатика')).toBe('Информатики');
    expect(genitive('Черчение')).toBe('Черчения');
    expect(genitive('English')).toBeNull();
    expect(genitive('С')).toBeNull();
  });

  it('подпись под «Подгруппой»', () => {
    expect(subgroupRoomsNote(['ИГ', 'Физра', 'Ин. яз'])).toBe('Кабинеты по подгруппам различаются у ИГ, Физры и Ин. яза.');
    expect(subgroupRoomsNote(['ИГ'])).toBe('Кабинеты по подгруппам различаются у ИГ.');
    expect(subgroupRoomsNote(['Факульт.'])).toBe('Кабинеты по подгруппам различаются у Факульт.');
    // Если склонить нельзя — просто перечисляем
    expect(subgroupRoomsNote(['ИГ', 'English'])).toBe('Кабинеты по подгруппам различаются: ИГ и English.');
    expect(subgroupRoomsNote([])).toBe('Сейчас кабинеты у подгрупп совпадают.');
  });

  it('время сборки по Москве', () => {
    expect(formatBuildTime('2026-10-09T12:20:00Z')).toBe('9 октября 2026, 15:20');
    expect(formatBuildTime('2026-12-31T21:05:00Z')).toBe('1 января 2027, 00:05');
    expect(formatBuildTime('2026-10-09T12:20:00Z', '2026')).toBe('9 октября, 15:20');
    expect(formatBuildTime('2026-10-09T12:20:00Z', '2027')).toBe('9 октября 2026, 15:20');
    expect(formatBuildTime('сломано')).toBe('—');
  });

  it('состояние офлайна и хранилища', () => {
    expect(offlineLabel(false, false)).toBe('Не поддерживается браузером');
    expect(offlineLabel(true, true)).toBe('Включена');
    expect(offlineLabel(true, false)).toBe('Включится после первой загрузки');
    expect(persistedLabel(true)).toBe('Да');
    expect(persistedLabel(false)).toBe('Нет');
    expect(persistedLabel(null)).toBe('Неизвестно');
  });
});
