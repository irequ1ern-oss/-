import { describe, expect, it } from 'vitest';
import type { ResolvedLesson } from '../core/schedule';
import { lessonMenuItems } from './LessonRow';

const lesson = (status: ResolvedLesson['status']): ResolvedLesson => ({
  start: '09:00',
  end: '10:40',
  subjectId: 'mss',
  date: '2026-10-12',
  source: status === 'added' ? 'override' : 'main',
  status,
});

const labels = (status: ResolvedLesson['status']) => lessonMenuItems(lesson(status), () => undefined).map((i) => i.label);

describe('меню пары', () => {
  it('обычная, заменённая и добавленная пара: отменить, заменить, изменить день', () => {
    for (const status of ['normal', 'changed', 'added'] as const) {
      expect(labels(status)).toEqual(['О предмете', 'Отменить пару', 'Заменить…', 'Изменить день']);
    }
  });

  it('отменённую пару можно вернуть, но не заменить', () => {
    expect(labels('cancelled')).toEqual(['О предмете', 'Вернуть пару', 'Изменить день']);
  });

  it('«О предмете» открывает карточку этого предмета', () => {
    let opened = '';
    lessonMenuItems(lesson('normal'), (id) => (opened = id))[0].onSelect();
    expect(opened).toBe('mss');
  });
});
