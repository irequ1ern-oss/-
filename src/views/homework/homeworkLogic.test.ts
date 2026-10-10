import { describe, expect, it } from 'vitest';
import {
  dueLabel, eventDateLabel, formatShortDate, groupHomework, groupOf, isOverdue, postpone, postponedDue, postponeToastText,
  removeHomework, replaceHomework, restoreHomework, setDone, streakText, upcomingEvents, upcomingHomework,
} from './homeworkLogic';
import type { TrackedHomework } from './stats';
import type { EventItem } from '../../shell/app';
import { override, sources } from '../../core/testData';

const hw = (id: string, due: string, done = false): TrackedHomework => ({ id, subjectId: 'mss', title: id, due, done });

// 2026-10-14 — среда; воскресенье этой недели — 18-е.
const TODAY = '2026-10-14';

describe('groupOf', () => {
  it('по сроку', () => {
    expect(groupOf('2026-10-13', TODAY)).toBe('overdue');
    expect(groupOf('2026-10-14', TODAY)).toBe('today');
    expect(groupOf('2026-10-15', TODAY)).toBe('tomorrow');
    expect(groupOf('2026-10-16', TODAY)).toBe('week');
    expect(groupOf('2026-10-18', TODAY)).toBe('week');
    expect(groupOf('2026-10-19', TODAY)).toBe('later');
  });

  it('в субботу завтра — воскресенье, «на этой неделе» пусто', () => {
    expect(groupOf('2026-10-18', '2026-10-17')).toBe('tomorrow');
    expect(groupOf('2026-10-19', '2026-10-17')).toBe('later');
  });

  it('в воскресенье завтра — уже следующая неделя', () => {
    expect(groupOf('2026-10-19', '2026-10-18')).toBe('tomorrow');
    expect(groupOf('2026-10-20', '2026-10-18')).toBe('later');
  });
});

describe('groupHomework', () => {
  it('группы по порядку, пустые пропускаются, внутри — по сроку', () => {
    const items = [
      hw('later', '2026-10-25'),
      hw('od2', '2026-10-13'),
      hw('od1', '2026-10-10'),
      hw('today', '2026-10-14'),
      hw('done1', '2026-10-12', true),
      hw('done2', '2026-10-13', true),
      hw('week', '2026-10-17'),
    ];
    const { groups, done } = groupHomework(items, TODAY);
    expect(groups.map((g) => [g.title, g.items.map((h) => h.id)])).toEqual([
      ['Просрочено', ['od1', 'od2']],
      ['Сегодня', ['today']],
      ['На этой неделе', ['week']],
      ['Позже', ['later']],
    ]);
    expect(done.map((h) => h.id)).toEqual(['done2', 'done1']);
  });

  it('одинаковый срок — исходный порядок', () => {
    const { groups } = groupHomework([hw('b', TODAY), hw('a', TODAY)], TODAY);
    expect(groups[0].items.map((h) => h.id)).toEqual(['b', 'a']);
  });

  it('пустой список', () => {
    expect(groupHomework([], TODAY)).toEqual({ groups: [], done: [] });
  });
});

describe('подписи сроков', () => {
  it('formatShortDate', () => {
    expect(formatShortDate('2026-10-16')).toBe('пт, 16 окт.');
    expect(formatShortDate('2026-05-04')).toBe('пн, 4 мая');
  });

  it('dueLabel', () => {
    expect(dueLabel('2026-10-14', TODAY)).toBe('сегодня');
    expect(dueLabel('2026-10-15', TODAY)).toBe('завтра');
    expect(dueLabel('2026-10-13', TODAY)).toBe('вчера');
    expect(dueLabel('2026-10-11', TODAY)).toBe('просрочено на 3 дн.');
    expect(dueLabel('2026-10-11', TODAY, true)).toBe('вс, 11 окт.');
    expect(dueLabel('2026-10-16', TODAY)).toBe('пт, 16 окт.');
  });

  it('eventDateLabel', () => {
    expect(eventDateLabel('2026-10-14', TODAY)).toBe('сегодня');
    expect(eventDateLabel('2026-10-16', TODAY)).toBe('послезавтра');
    expect(eventDateLabel('2026-10-20', TODAY)).toBe('вт, 20 окт.');
  });

  it('isOverdue', () => {
    expect(isOverdue(hw('a', '2026-10-13'), TODAY)).toBe(true);
    expect(isOverdue(hw('a', '2026-10-13', true), TODAY)).toBe(false);
    expect(isOverdue(hw('a', TODAY), TODAY)).toBe(false);
  });
});

describe('изменения списка', () => {
  const items = [hw('a', '2026-10-13'), hw('b', '2026-10-14'), hw('c', '2026-10-15')];

  it('setDone ставит и убирает дату отметки', () => {
    const done = setDone(items, 'b', true, TODAY);
    expect(done[1]).toEqual({ ...items[1], done: true, doneAt: TODAY });
    expect(done[0]).toBe(items[0]);
    expect(setDone(done, 'b', false, TODAY)[1]).toEqual(items[1]);
  });

  it('postpone ставит новый срок только этому ДЗ', () => {
    const moved = postpone(items, 'c', '2026-10-16');
    expect(moved[2]).toEqual({ ...items[2], due: '2026-10-16' });
    expect(moved[0]).toBe(items[0]);
  });

  it('remove + restore возвращают на прежнее место', () => {
    const { items: left, removed } = removeHomework(items, 'b');
    expect(left.map((h) => h.id)).toEqual(['a', 'c']);
    expect(removed).toEqual({ item: items[1], index: 1 });
    expect(restoreHomework(left, removed!.item, removed!.index).map((h) => h.id)).toEqual(['a', 'b', 'c']);
    // Повторное восстановление ничего не дублирует.
    expect(restoreHomework(items, items[1], 1)).toBe(items);
    // Место за концом списка — в конец.
    expect(restoreHomework([], items[2], 5).map((h) => h.id)).toEqual(['c']);
  });

  it('remove несуществующего', () => {
    expect(removeHomework(items, 'x')).toEqual({ items });
  });

  it('replaceHomework', () => {
    const changed = { ...items[0], title: 'новое' };
    expect(replaceHomework(items, changed)[0].title).toBe('новое');
  });
});

describe('postponedDue: новый срок — следующая пара предмета', () => {
  // В тестовом расписании МСС — по понедельникам и пятницам, ИГ — по средам и четвергам.
  const src = sources();
  const item = (subjectId: string, due: string) => ({ subjectId, due });

  it('срок впереди — следующая пара после него', () => {
    expect(postponedDue(item('mss', '2026-10-16'), TODAY, src)).toBe('2026-10-19');
    expect(postponedDue(item('ig', '2026-10-15'), TODAY, src)).toBe('2026-10-21');
  });

  it('срок сегодня — следующая пара после сегодняшней', () => {
    expect(postponedDue(item('ig', TODAY), TODAY, src)).toBe('2026-10-15');
  });

  it('просроченное — от сегодняшнего дня, а не от старого срока', () => {
    // Срок 7-го, сегодня 14-е: не 8-е (тоже в прошлом), а ближайшая пара МСС — пятница.
    const due = postponedDue(item('mss', '2026-10-07'), TODAY, src);
    expect(due).toBe('2026-10-16');
    expect(due > TODAY).toBe(true);
    expect(postponeToastText(due, TODAY)).toBe('Срок перенесён на пт, 16 окт.');
  });

  it('отменённая пара пропускается', () => {
    const cancelled = sources({ overrides: [override({ date: '2026-10-16', action: 'cancelDay' })] });
    expect(postponedDue(item('mss', '2026-10-07'), TODAY, cancelled)).toBe('2026-10-19');
  });

  it('пар предмета нет — следующий день после сегодня или после срока', () => {
    expect(postponedDue(item('nope', '2026-10-07'), TODAY, src)).toBe('2026-10-15');
    expect(postponedDue(item('nope', '2026-10-20'), TODAY, src)).toBe('2026-10-21');
  });
});

describe('Ближайшее', () => {
  it('ДЗ на 7 дней вперёд, просроченные первыми, без выполненных', () => {
    const items = [
      hw('far', '2026-10-22'),
      hw('week', '2026-10-21'),
      hw('today', TODAY),
      hw('od', '2026-10-10'),
      hw('done', '2026-10-15', true),
    ];
    expect(upcomingHomework(items, TODAY).map((h) => h.id)).toEqual(['od', 'today', 'week']);
  });

  it('события с сегодня на 14 дней, по дате', () => {
    const ev = (id: string, date: string): EventItem => ({ id, subjectId: 'mss', title: id, date, kind: 'test' });
    const events = [ev('b', '2026-10-28'), ev('past', '2026-10-13'), ev('a', TODAY), ev('far', '2026-10-29')];
    expect(upcomingEvents(events, TODAY).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('тексты', () => {
  it('postponeToastText', () => {
    expect(postponeToastText('2026-10-15', TODAY)).toBe('Срок перенесён на завтра');
    expect(postponeToastText(TODAY, TODAY)).toBe('Срок перенесён на сегодня');
    expect(postponeToastText('2026-10-17', TODAY)).toBe('Срок перенесён на сб, 17 окт.');
  });

  it('streakText', () => {
    expect(streakText(1, false)).toBe('Серия: 1 день без просрочек');
    expect(streakText(3, false)).toBe('Серия: 3 дня без просрочек');
    expect(streakText(11, false)).toBe('Серия: 11 дней без просрочек');
    expect(streakText(0, true)).toBe('Серия прервана: есть просроченные ДЗ');
    expect(streakText(0, false)).toBe('Серия начнётся снова завтра');
  });
});
