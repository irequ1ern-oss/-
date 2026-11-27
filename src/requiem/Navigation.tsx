import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/iconData';
import { Sheet } from './Sheet';
import { titles, type Desk } from './client';
import type { Edit } from './Desk';

export const sections: Record<string, string> = {
  desk: 'Обзор',
  academy: 'Учёба',
  chronos: 'Сценарии',
  transit: 'Дорога',
  tasks: 'Дела',
  ledger: 'Время',
  oracle: 'Oracle',
  sanctum: 'Архив и заметки',
  shay: 'Shay',
  workshop: 'Настройки',
  admin: 'Управление',
};
export const icons: Record<string, IconName> = {
  desk: 'sun',
  academy: 'book-open',
  chronos: 'git-branch',
  transit: 'map-pin',
  tasks: 'check-square',
  ledger: 'clock',
  oracle: 'bell',
  sanctum: 'book-bookmark',
  shay: 'sparkle',
  workshop: 'gear',
  admin: 'shield',
};
const groups = [
  ['Учебный день', 'desk', 'academy', 'tasks', 'transit'],
  ['Планирование', 'chronos', 'ledger', 'oracle', 'shay'],
  ['Рабочее пространство', 'sanctum', 'workshop', 'admin'],
];
const short: Record<string, string> = {
  sanctum: 'Архив',
  workshop: 'Настройки',
  admin: 'Админ',
};
function loadPins(valid: string[]): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem('rq.dock.v1') ?? 'null');
    if (Array.isArray(ids)) {
      const clean = [
        ...new Set(
          ids.filter(
            (id): id is string => typeof id === 'string' && valid.includes(id),
          ),
        ),
      ];
      if (clean.length) return clean.slice(0, 4);
    }
  } catch {
    /* Device storage is optional. */
  }
  return valid.slice(0, 4);
}
interface Props {
  valid: string[];
  selected: string;
  navigate: (id: string) => void;
  d: Desk | null;
  edit: Edit;
  mode: 'menu' | 'search' | null;
  setMode: (v: 'menu' | 'search' | null) => void;
  academy: (view: 'journal' | 'stats') => void;
}
export function Navigation({
  valid,
  selected,
  navigate,
  d,
  edit,
  mode,
  setMode,
  academy,
}: Props) {
  const [pins, setPins] = useState(() => loadPins(valid));
  const [editing, customize] = useState(false),
    [q, query] = useState(''),
    [notice, say] = useState('');
  const close = () => {
    setMode(null);
    customize(false);
    query('');
    say('');
  };
  const go = (id: string) => {
    close();
    navigate(id);
  };
  const term = q.trim().toLocaleLowerCase('ru');
  const content = term
    ? (d?.records
        .filter(
          (r) =>
            ['task', 'note', 'memory'].includes(r.kind) &&
            Object.values(r.data).join(' ').toLowerCase().includes(term),
        )
        .slice(0, 12) ?? [])
    : [];
  const matching = (s: string) =>
    mode !== 'search' || s.toLocaleLowerCase('ru').includes(term);
  const actions: [string, IconName, () => void][] = d
    ? [
        ['Отметить урок', 'check-circle', () => academy('journal')],
        ['Посещаемость', 'trend-up', () => academy('stats')],
        ['Новая задача', 'plus', () => edit('task')],
        ['Записать оценку', 'graduation-cap', () => edit('grade')],
      ]
    : [];
  function toggle(id: string) {
    const next = pins.includes(id)
      ? pins.filter((p) => p !== id)
      : [...pins, id];
    if (!next.length || next.length > 4) return;
    setPins(next);
    try {
      localStorage.setItem('rq.dock.v1', JSON.stringify(next));
    } catch {
      say('Панель изменена до закрытия приложения.');
    }
  }
  return (
    <>
      <nav class="rq-bottom" aria-label="Быстрая навигация">
        {pins.map((id) => (
          <button
            key={id}
            aria-current={selected === id ? 'page' : undefined}
            onClick={() => go(id)}
          >
            <Icon
              name={icons[id]}
              weight={selected === id ? 'fill' : 'regular'}
              size={21}
            />
            <span>{short[id] ?? sections[id]}</span>
          </button>
        ))}
        <button
          aria-expanded={mode === 'menu'}
          aria-current={!pins.includes(selected) ? 'page' : undefined}
          onClick={() => {
            customize(false);
            setMode('menu');
          }}
        >
          <Icon name="list-bullets" size={21} />
          <span>Ещё</span>
        </button>
      </nav>
      {mode && (
        <Sheet
          key={mode}
          title={
            mode === 'search'
              ? 'Поиск и команды'
              : editing
                ? 'Нижняя панель'
                : 'Все разделы'
          }
          close={close}
        >
          {mode === 'search' ? (
            <input
              autoFocus
              type="search"
              class="search"
              aria-label="Поиск по рабочему пространству"
              placeholder="Раздел, действие или запись"
              value={q}
              onInput={(e) => query(e.currentTarget.value)}
            />
          ) : (
            <button class="menu-config" onClick={() => customize(!editing)}>
              {editing ? 'Готово' : 'Настроить нижнюю панель'}
            </button>
          )}
          {editing && mode === 'menu' ? (
            <>
              <p>
                Закреплено {pins.length} из 4. Сними отметку, чтобы освободить
                место. Порядок соответствует выбору на этом устройстве.
              </p>
              <div class="menu-links">
                {valid.map((id) => (
                  <button
                    key={id}
                    aria-pressed={pins.includes(id)}
                    disabled={
                      pins.includes(id) ? pins.length === 1 : pins.length === 4
                    }
                    onClick={() => toggle(id)}
                  >
                    <Icon name={icons[id]} size={18} />
                    {sections[id]}
                    {pins.includes(id) && <small>{pins.indexOf(id) + 1}</small>}
                  </button>
                ))}
              </div>
              {notice && <p role="status">{notice}</p>}
            </>
          ) : (
            <>
              {actions.some(([name]) => matching(name)) && (
                <div class="menu-group">
                  <h3>Быстрые действия</h3>
                  <div class="menu-links">
                    {actions
                      .filter(([name]) => matching(name))
                      .map(([name, icon, fn]) => (
                        <button
                          key={name}
                          onClick={() => {
                            close();
                            fn();
                          }}
                        >
                          <Icon name={icon} size={18} />
                          {name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              {groups.map(([label, ...ids]) => {
                const found = ids.filter(
                  (id) => valid.includes(id) && matching(sections[id]),
                );
                return (
                  found.length > 0 && (
                    <div class="menu-group" key={label}>
                      <h3>{label}</h3>
                      <div class="menu-links">
                        {found.map((id) => (
                          <button
                            key={id}
                            aria-current={selected === id ? 'page' : undefined}
                            onClick={() => go(id)}
                          >
                            <Icon name={icons[id]} size={18} />
                            {sections[id]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                );
              })}
              {mode === 'search' &&
                content.map((r) => (
                  <button
                    class="line"
                    key={r.kind + r.id}
                    onClick={() => {
                      close();
                      edit(r.kind, r.id);
                    }}
                  >
                    {String(
                      r.data.title ||
                        r.data.text ||
                        r.data.content ||
                        titles[r.kind],
                    ).slice(0, 100)}
                    <small>{titles[r.kind]}</small>
                  </button>
                ))}
              {mode === 'search' &&
                term &&
                !valid.some((id) => matching(sections[id])) &&
                !actions.some(([name]) => matching(name)) &&
                !content.length && (
                  <p role="status">
                    Совпадений нет. Попробуй название предмета, задачи или
                    раздела.
                  </p>
                )}
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
