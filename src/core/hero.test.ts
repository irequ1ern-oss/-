import { describe, expect, it } from 'vitest';
import { computeHero } from './hero';
import { override, period, sources } from './testData';
import { clockAt } from './time';

// Тестовое расписание: пн 09:00–10:40 МСС, 10:50–12:40 ПФО; ср 09:00–09:45 ИГ;
// чт 09:00–10:40 ИГ, 10:50–11:35 ИГ; пт 13:00–14:40 МСС. 2026-10-12 — понедельник.

describe('computeHero: пять состояний главного блока', () => {
  it('идёт пара: секунды до конца, прогресс, «Далее», прогресс дня', () => {
    const r = computeHero(clockAt('2026-10-12', '10:12:48'), sources());
    expect(r.hero.kind).toBe('lesson');
    if (r.hero.kind !== 'lesson') return;
    expect(r.hero.lesson.subjectId).toBe('mss');
    expect(r.hero.secondsLeft).toBe(27 * 60 + 12); // таймер «27:12»
    expect(r.hero.progress).toBeCloseTo((72 * 60 + 48) / (100 * 60));
    expect(r.upNext?.subjectId).toBe('pfo');
    expect(r.progress).toMatchObject({ index: 1, total: 2, remainingSeconds: (2 * 3600 + 27 * 60 + 12) });
    expect(r.progress?.segments[1]).toBe(0);
  });

  it('перемена: таймер до следующей пары и длина перемены', () => {
    const r = computeHero(clockAt('2026-10-12', '10:45:00'), sources());
    expect(r.hero.kind).toBe('break');
    if (r.hero.kind !== 'break') return;
    expect(r.hero.next.subjectId).toBe('pfo');
    expect(r.hero.secondsUntil).toBe(300);
    expect(r.hero.breakSeconds).toBe(600);
    expect(r.progress?.index).toBe(2);
    expect(r.upNext).toBeUndefined();
  });

  it('до начала пар', () => {
    const r = computeHero(clockAt('2026-10-12', '08:18'), sources());
    expect(r.hero.kind).toBe('before');
    if (r.hero.kind !== 'before') return;
    expect(r.hero.first.start).toBe('09:00');
    expect(r.hero.secondsUntil).toBe(42 * 60);
    expect(r.progress?.index).toBe(0);
    expect(r.upNext?.subjectId).toBe('pfo');
  });

  it('пары закончились: следующий учебный день', () => {
    const r = computeHero(clockAt('2026-10-12', '12:40'), sources());
    expect(r.hero.kind).toBe('after');
    if (r.hero.kind !== 'after') return;
    expect(r.hero.next?.day.date).toBe('2026-10-14');
    expect(r.hero.next?.first.subjectId).toBe('ig');
    expect(r.progress).toBeUndefined();
  });

  it('выходной: превью понедельника', () => {
    const r = computeHero(clockAt('2026-10-17', '11:00'), sources());
    expect(r.hero).toMatchObject({ kind: 'dayoff', reason: 'weekend' });
    if (r.hero.kind !== 'dayoff') return;
    expect(r.hero.next?.day.date).toBe('2026-10-19');
    expect(r.hero.next?.daysAhead).toBe(2);
  });

  it('будний день без пар — «free», каникулы — «holiday», всё отменено — «cancelled»', () => {
    expect(computeHero(clockAt('2026-10-13', '10:00'), sources()).hero).toMatchObject({ kind: 'dayoff', reason: 'free' });
    const holidays = sources({ periods: [period({ from: '2026-10-26', to: '2026-11-03', title: 'Каникулы' })] });
    const h = computeHero(clockAt('2026-10-26', '10:00'), holidays).hero;
    expect(h).toMatchObject({ kind: 'dayoff', reason: 'holiday' });
    if (h.kind === 'dayoff') expect(h.period?.title).toBe('Каникулы');
    const cancelled = sources({ overrides: [override({ date: '2026-10-12', action: 'cancelDay' })] });
    expect(computeHero(clockAt('2026-10-12', '08:00'), cancelled).hero).toMatchObject({ kind: 'dayoff', reason: 'cancelled' });
  });

  it('граница: ровно в начале пары — уже пара, ровно в конце последней — «после пар»', () => {
    expect(computeHero(clockAt('2026-10-12', '09:00:00'), sources()).hero.kind).toBe('lesson');
    expect(computeHero(clockAt('2026-10-12', '10:40:00'), sources()).hero.kind).toBe('break');
    expect(computeHero(clockAt('2026-10-12', '12:39:59'), sources()).hero.kind).toBe('lesson');
    expect(computeHero(clockAt('2026-10-12', '12:40:00'), sources()).hero.kind).toBe('after');
  });

  it('отменённая пара пропускается: следующей становится незанятая', () => {
    const src = sources({ overrides: [override({ date: '2026-10-12', action: 'cancel', target: '09:00' })] });
    const r = computeHero(clockAt('2026-10-12', '09:30'), src);
    expect(r.hero.kind).toBe('before');
    if (r.hero.kind === 'before') expect(r.hero.first.subjectId).toBe('pfo');
    expect(r.progress?.total).toBe(1);
  });
});
