// Проверка настоящего data/schedule.json: если в нём опечатка, тест покажет, где именно.

import { describe, expect, it } from 'vitest';
import scheduleJson from '../../data/schedule.json';
import type { MainSchedule } from './schedule';
import { validateMainSchedule } from './validate';
import { testMain } from './testData';

describe('data/schedule.json', () => {
  it('без ошибок', () => {
    expect(validateMainSchedule(scheduleJson as MainSchedule)).toEqual([]);
  });

  it('в среду первая пара 09:00–09:45', () => {
    const wed = (scheduleJson as MainSchedule).week.wed ?? [];
    expect([wed[0].start, wed[0].end]).toEqual(['09:00', '09:45']);
  });
});

describe('validateMainSchedule', () => {
  it('находит типичные ошибки', () => {
    const broken: MainSchedule = {
      ...testMain,
      week: {
        mon: [
          { start: '09:00', end: '10:40', subjectId: 'mss' },
          { start: '10:30', end: '11:00', subjectId: 'нет-такого' },
          { start: '12:00', end: '11:00', subjectId: 'mss' },
          { start: '9:00', end: '10:00', subjectId: 'mss' },
        ],
      },
    };
    const errors = validateMainSchedule(broken);
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toContain('неизвестный предмет');
  });
});
