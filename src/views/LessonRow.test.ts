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
  it('обычная и заменённая пара: заменить, изменить день, отменить', () => {
    for (const status of ['normal', 'changed'] as const) {
      expect(labels(status)).toEqual(['О предмете', 'Заменить…', 'Изменить день', 'Отменить пару']);
    }
  });

  it('добавленную пару можно изменить или удалить, а не отменить', () => {
    expect(labels('added')).toEqual(['О предмете', 'Изменить…', 'Изменить день', 'Удалить пару']);
  });

  it('отменённую пару можно вернуть, но не заменить', () => {
    expect(labels('cancelled')).toEqual(['О предмете', 'Вернуть пару', 'Изменить день']);
  });

  it('красные только отмена и удаление — и они последние', () => {
    for (const status of ['normal', 'changed', 'added', 'cancelled'] as const) {
      const items = lessonMenuItems(lesson(status), () => undefined);
      const red = items.filter((i) => i.destructive).map((i) => i.label);
      expect(red).toEqual(status === 'cancelled' ? [] : [status === 'added' ? 'Удалить пару' : 'Отменить пару']);
      if (red.length) expect(items[items.length - 1].destructive).toBe(true);
    }
  });

  it('«О предмете» открывает карточку этого предмета', () => {
    let opened = '';
    lessonMenuItems(lesson('normal'), (id) => (opened = id))[0].onSelect();
    expect(opened).toBe('mss');
  });
});
