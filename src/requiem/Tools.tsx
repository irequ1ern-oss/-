import { useEffect, useState } from 'preact/hooks';
import { addDays, moscowClock } from '../core/time';
import {
  api,
  download,
  hm,
  titles,
  words,
  type Desk,
  type Plan,
} from './client';
import { layout, Summary, type Edit } from './Desk';
import { LastPair } from './LastPair';
export type Runner = (fn: () => Promise<void>) => void;
export function ArchiveList({
  d,
  kinds,
  edit,
  run,
  reload,
}: {
  d: Desk;
  kinds: string[];
  edit: Edit;
  run: Runner;
  reload: () => Promise<void>;
}) {
  const [query, set] = useState(''),
    [pending, ask] = useState('');
  const rows = d.records.filter(
    (r) =>
      kinds.includes(r.kind) &&
      Object.values(r.data)
        .join(' ')
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section class="rq-card">
      <div class="inline">
        {kinds
          .filter((k) => !['decision', 'layout'].includes(k))
          .map((k) => (
            <button
              onClick={() =>
                edit(
                  k,
                  ['travel', 'chat_settings'].includes(k)
                    ? 'default'
                    : undefined,
                )
              }
            >
              + {titles[k]}
            </button>
          ))}
      </div>
      <input
        class="search"
        aria-label="Поиск записей"
        placeholder="Найти запись…"
        value={query}
        onInput={(e) => set(e.currentTarget.value)}
      />
      {rows.map((r) => (
        <div class="rq-record" key={r.kind + r.id}>
          <button class="text-btn" onClick={() => edit(r.kind, r.id)}>
            <small>
              {titles[r.kind]} · {String(r.data.date ?? r.updated.slice(0, 10))}
            </small>
            <b>
              {String(
                r.data.title ??
                  r.data.number ??
                  r.data.teacher ??
                  r.data.station ??
                  words[String(r.data.category)] ??
                  r.data.subject ??
                  r.kind,
              )}
            </b>
            <span>
              {[
                d.subjects[String(r.data.subject)]?.short,
                r.data.grade,
                r.data.departure &&
                  String(r.data.departure) + ' – ' + r.data.arrival,
                r.data.text,
                r.data.note,
                r.data.due,
                r.data.outcome && words[String(r.data.outcome)],
              ]
                .filter(Boolean)
                .join(' · ')
                .slice(0, 170)}
            </span>
          </button>
          {r.kind === 'note' && (
            <button
              onClick={() =>
                download(
                  'note.md',
                  '# ' + r.data.title + '\n\n' + r.data.text,
                  'text/markdown',
                )
              }
            >
              .md
            </button>
          )}
          {r.kind === 'task' && (
            <button
              onClick={() =>
                run(async () => {
                  await api('changes', {
                    changes: [
                      {
                        kind: r.kind,
                        id: r.id,
                        version: r.version,
                        data: { ...r.data, done: !r.data.done },
                      },
                    ],
                  });
                  await reload();
                })
              }
            >
              {r.data.done ? 'Открыть' : 'Готово'}
            </button>
          )}
          <button
            aria-label="Удалить запись"
            onClick={() => {
              if (pending !== r.id) {
                ask(r.id);
                return;
              }
              run(async () => {
                await api('changes', {
                  changes: [
                    { kind: r.kind, id: r.id, version: r.version, data: null },
                  ],
                });
                ask('');
                await reload();
              });
            }}
          >
            {pending === r.id ? 'Подтвердить удаление' : '×'}
          </button>
        </div>
      ))}
      {rows.length === 0 && <p>Записей пока нет.</p>}
    </section>
  );
}
export function Twin({ d, edit }: { d: Desk; edit: Edit }) {
  return (
    <section class="rq-card">
      <h2>Бюджет посещаемости</h2>
      <p>
        Опоздание считается присутствием. Уважительные пропуски и уроки без
        отметки исключены. Цель задаёшь ты.
      </p>
      {d.stats.map((s) => (
        <button
          class="rq-stat"
          onClick={() => edit('subject', s.subject, { subject: s.subject })}
        >
          <span>
            <b>{d.subjects[s.subject].short}</b>
            <small>
              {s.attended} из {s.total} · цель {s.target}%
              {s.grades.count > 0 && (
                <small>
                  Средний балл {s.grades.mean} · пятёрок до цели{' '}
                  {s.grades.target}: {s.grades.fives ?? 'недостижимо'}
                </small>
              )}
            </small>
          </span>
          <span>
            <i style={{ width: (s.percent ?? 0) + '%' }} />
          </span>
          <span>
            {s.percent === null ? '—' : s.percent + '%'}
            <small>
              {s.reserve === null
                ? 'Остаток не задан'
                : 'Резерв ' + s.reserve + ' · ' + s.unit}
            </small>
            {s.projected_full !== null && (
              <small>
                Максимум к концу {s.projected_full}% · нужно {s.required}{' '}
                {s.unit}
              </small>
            )}
          </span>
        </button>
      ))}
    </section>
  );
}
export function Simulator({
  d,
  run,
  reload,
}: {
  d: Desk;
  run: Runner;
  reload: () => Promise<void>;
}) {
  const pref = layout(d),
    [skip, set] = useState<string[]>([]),
    [strategy, choose] = useState(pref.strategy),
    [plan, show] = useState<Plan | null>(null),
    [msg, report] = useState('');
  useEffect(() => {
    let active = true;
    show(null);
    report('');
    api<Plan>('simulate', { day: d.date, skip, strategy })
      .then((s) => {
        if (active) show(s);
      })
      .catch((e) => {
        if (active) report(e.message);
      });
    return () => {
      active = false;
    };
  }, [d, skip, strategy]);
  return (
    <>
      <LastPair d={d} strategy={strategy} select={set} />
      <div class="rq-grid">
        <section class="rq-card">
          <h2>Что будет, если…</h2>
          <label>
            Стратегия
            <select
              value={strategy}
              onChange={(e) => choose(e.currentTarget.value)}
            >
              {d.strategies.map((s) => (
                <option>{s}</option>
              ))}
              {d.records
                .filter((r) => r.kind === 'strategy')
                .map((r) => (
                  <option value={r.id}>{String(r.data.title)}</option>
                ))}
            </select>
          </label>
          <p>Отметь уроки, которые планируешь пропустить.</p>
          {d.lessons.map((l) => (
            <label class="check">
              <input
                type="checkbox"
                checked={skip.includes(l.start)}
                onChange={() =>
                  set(
                    skip.includes(l.start)
                      ? skip.filter((s) => s !== l.start)
                      : [...skip, l.start],
                  )
                }
              />
              {l.start} · {l.title}
            </label>
          ))}
          <button
            onClick={() =>
              set(
                skip.length === d.lessons.length
                  ? []
                  : d.lessons.map((l) => l.start),
              )
            }
          >
            Переключить весь день
          </button>
        </section>
        <section class="rq-card">
          <h2>Последствия</h2>
          {plan && (
            <>
              <Summary p={plan} />
              <button
                class="primary"
                disabled={!!plan.blocked.length}
                onClick={() =>
                  run(async () => {
                    await api('decide', { day: d.date, skip, strategy });
                    await reload();
                    report('Решение сохранено в журнале');
                  })
                }
              >
                Сохранить решение
              </button>
            </>
          )}
          {msg && <p>{msg}</p>}
        </section>
      </div>
    </>
  );
}
interface Report {
  time: {
    categories: Record<string, number>;
    total: number;
    estimated: number;
    actual: number;
    measured: number;
  };
  weekdays: { absent: number; total: number; late: number }[];
}
export function Reports({ d, run }: { d: Desk; run: Runner }) {
  const [start, from] = useState(addDays(d.date, -6)),
    [end, to] = useState(d.date),
    [report, show] = useState<Report | null>(null);
  const [range, setRange] = useState('7');
  useEffect(() => {
    let active = true;
    run(async () => {
      const v = await api<Report>('report?start=' + start + '&end=' + end);
      if (active) show(v);
    });
    return () => {
      active = false;
    };
  }, [start, end, d]);
  return (
    <section class="rq-card">
      <h2>Время и посещаемость</h2>
      <div class="inline">
        <select
          aria-label="Период"
          value={range}
          onChange={(e) => {
            const x = e.currentTarget.value;
            setRange(x);
            if (x !== 'custom') {
              from(addDays(d.date, 1 - Number(x)));
              to(d.date);
            }
          }}
        >
          {[
            ['1', 'День'],
            ['7', 'Неделя'],
            ['30', '30 дней'],
            ['custom', 'Свой период'],
          ].map(([v, t]) => (
            <option value={v}>{t}</option>
          ))}
        </select>
        <input
          aria-label="От"
          type="date"
          value={start}
          onChange={(e) => {
            if (e.currentTarget.value) {
              setRange('custom');
              from(e.currentTarget.value);
            }
          }}
        />
        <input
          aria-label="До"
          type="date"
          value={end}
          onChange={(e) => {
            if (e.currentTarget.value) {
              setRange('custom');
              to(e.currentTarget.value);
            }
          }}
        />
      </div>
      {report && (
        <>
          <div class="rq-metrics">
            <span>
              Учтено<b>{report.time.total} мин</b>
            </span>
            <span>
              Прогноз экономии<b>{report.time.estimated} мин</b>
            </span>
            <span>
              По факту
              <b>
                {report.time.measured
                  ? report.time.actual + ' мин'
                  : 'Нет замеров'}
              </b>
            </span>
          </div>
          {Object.entries(report.time.categories).map(([k, n]) => (
            <p>
              {words[k]} · {n} мин
            </p>
          ))}
          <div class="rq-week">
            {report.weekdays.map((w, i) => (
              <div
                style={
                  {
                    '--fill': w.total ? w.absent / w.total : 0,
                  } as preact.JSX.CSSProperties
                }
              >
                <strong>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i]}</strong>
                <small>
                  {w.absent}/{w.total}
                </small>
              </div>
            ))}
          </div>
          <small>Пропусков / отмеченных уроков по дням недели</small>
        </>
      )}
    </section>
  );
}
export function Transit({
  d,
  edit,
  run,
  reload,
}: {
  d: Desk;
  edit: Edit;
  run: Runner;
  reload: () => Promise<void>;
}) {
  const [source, setSource] = useState<{
    enabled: boolean;
    updated: string | null;
  } | null>(null);
  useEffect(() => {
    run(async () => setSource(await api('transit/source')));
  }, [d]);
  const [release, set] = useState(d.lessons.at(-1)?.end ?? '16:30'),
    [result, show] = useState<{
      train: Plan['train'];
      later: Plan['train'];
      delta: number | null;
      cutoff: number | null;
      fallback: Plan['train'];
      after_cutoff: number | null;
      inbound: {
        number: string;
        dep: number;
        arr: number;
        college: number;
        leave: number | null;
      } | null;
    } | null>(null);
  useEffect(() => {
    let active = true;
    run(async () => {
      const v = await api<typeof result>(
        'transit?day=' + d.date + '&release=' + release,
      );
      if (active) show(v);
    });
    return () => {
      active = false;
    };
  }, [release, d]);
  return (
    <>
      <section class="rq-card">
        <h2>Если выйти в…</h2>
        <div class="inline">
          <input
            type="time"
            aria-label="Выход из колледжа"
            value={release}
            onChange={(e) => {
              if (e.currentTarget.value) set(e.currentTarget.value);
            }}
          />
          <button onClick={() => edit('travel', 'default')}>
            Настроить дорогу
          </button>
        </div>
        {result?.train ? (
          <>
            <p class="rq-big">{hm(result.train.dep)}</p>
            <p>
              Рейс {result.train.number} · на станции {hm(result.train.arr)} ·
              дома {hm(result.train.home)}
            </p>
            <p>
              Комфортный выход {hm(result.train.leave)} · к посадке до{' '}
              {hm(result.train.latest)}
            </p>
            {result.train.tight && <p>Остаётся время только к посадке.</p>}
            {result.cutoff !== null && (
              <div class="rq-scenario">
                <strong>Последняя минута выхода · {hm(result.cutoff)}</strong>
                {result.fallback ? (
                  <p>
                    При выходе с {hm(result.cutoff + 1)} следующий рейс в{' '}
                    {hm(result.fallback.dep)}. На станции в{' '}
                    {hm(result.fallback.arr)}
                    {result.after_cutoff !== null && result.after_cutoff > 0
                      ? ' · на ' + result.after_cutoff + ' мин позже'
                      : ''}
                    .
                  </p>
                ) : (
                  <p>
                    После этого времени в сохранённом расписании подходящих
                    рейсов больше нет.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <p>Подходящих рейсов на выбранную дату и время нет.</p>
        )}
      </section>
      {result?.inbound && (
        <section class="rq-card">
          <h2>К первому уроку</h2>
          <p class="rq-big">{hm(result.inbound.dep)}</p>
          <p>
            Рейс {result.inbound.number} · прибытие на вокзал{' '}
            {hm(result.inbound.arr)} · в колледже {hm(result.inbound.college)}.
          </p>
          <small>
            {result.inbound.leave === null
              ? 'Время выхода из дома появится после ввода пути до станции.'
              : 'Комфортный выход из дома в ' + hm(result.inbound.leave)}
          </small>
        </section>
      )}
      <section class="rq-card">
        <h2>Импорт рейсов</h2>
        {source?.enabled && (
          <button
            onClick={() =>
              run(async () => {
                await api('transit/refresh', {});
                await reload();
              })
            }
          >
            Обновить из источника
          </button>
        )}
        <small>
          {source?.updated
            ? 'Последнее обновление источника · ' + source.updated
            : 'Подключено ручное расписание'}
        </small>
        <p>
          Файл JSON с массивом рейсов. Дата и направление указываются для
          каждого рейса.
        </p>
        <div class="inline">
          <button
            onClick={() =>
              download(
                'trips.json',
                JSON.stringify(
                  d.records.filter((r) => r.kind === 'trip').map((r) => r.data),
                  null,
                  2,
                ),
              )
            }
          >
            Экспорт рейсов
          </button>
          <label class="file">
            Выбрать JSON
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f)
                  run(async () => {
                    if (f.size > 500000) throw Error('Слишком большой файл');
                    const data = JSON.parse(await f.text());
                    const batch = Array.isArray(data) ? { trips: data } : data;
                    if (!Array.isArray(batch?.trips) || !batch.trips.length)
                      throw Error('Нужен непустой список рейсов');
                    await api('trips/import', batch);
                    await reload();
                  });
              }}
            />
          </label>
        </div>
        <small>
          Поля: date, direction (out / in), number, departure, arrival,
          overnight. Импорт обновляет совпадающий номер на ту же дату и
          направление.
        </small>
      </section>
      <ArchiveList
        d={d}
        kinds={['trip']}
        edit={edit}
        run={run}
        reload={reload}
      />
    </>
  );
}
export function Horizon({ d, run }: { d: Desk; run: Runner }) {
  const [plan, showPlan] = useState<{
    days: { date: string; skip: string[]; net: number | null }[];
  } | null>(null);
  const term = d.records.find(
    (r) =>
      r.kind === 'term' &&
      String(r.data.start) <= d.date &&
      String(r.data.end) >= d.date,
  );
  const termDays = term
    ? Math.round(
        (Date.parse(String(term.data.end)) - Date.parse(d.date)) / 86400000,
      ) + 1
    : null;
  const [days, set] = useState(7),
    [rows, show] = useState<
      {
        date: string;
        lessons: number;
        class_minutes: number;
        deadlines: string[];
        train: Plan['train'];
      }[]
    >([]);
  useEffect(() => {
    let active = true;
    run(async () => {
      const data = await api<typeof rows>(
        'horizon?start=' + d.date + '&days=' + days,
      );
      if (active) show(data);
    });
    return () => {
      active = false;
    };
  }, [days, d]);
  useEffect(() => showPlan(null), [days, d]);
  return (
    <section class="rq-card">
      <h2>Горизонт</h2>
      <select
        aria-label="Горизонт"
        value={days}
        onChange={(e) => set(Number(e.currentTarget.value))}
      >
        {Array.from(new Set([7, 14, 30, ...(termDays ? [termDays] : [])])).map(
          (x) => (
            <option value={x}>
              {x === termDays ? 'До конца семестра' : x + ' дней'}
            </option>
          ),
        )}
      </select>
      <button
        onClick={() =>
          run(async () =>
            showPlan(await api('optimize?start=' + d.date + '&days=' + days)),
          )
        }
      >
        Рассчитать план
      </button>
      {plan && (
        <details open>
          <summary>Последовательный прогноз</summary>
          {plan.days
            .filter((x) => x.skip.length)
            .map((x) => (
              <p>
                {x.date} · {x.skip.join(', ')} · {x.net ?? '—'} мин
              </p>
            ))}
          {!plan.days.some((x) => x.skip.length) && (
            <p>
              По текущим данным выгодных пропусков в рамках ограничений нет.
            </p>
          )}
        </details>
      )}
      {rows.map((r) => (
        <div class="line">
          <b>{r.date}</b>
          <span>
            {r.lessons} уроков · {r.class_minutes} мин
          </span>
          <small>
            {r.deadlines.join(' · ')} {r.train ? 'рейс ' + hm(r.train.dep) : ''}
          </small>
        </div>
      ))}
    </section>
  );
}
export function Journal({ run }: { run: Runner }) {
  const [items, set] = useState<
    { id: number; at: string; action: string; detail: unknown }[]
  >([]);
  useEffect(() => {
    run(async () => set(await api('audit')));
  }, []);
  return (
    <section class="rq-card">
      <h2>Журнал решений и действий</h2>
      <button
        onClick={() =>
          download('blackbox.json', JSON.stringify(items, null, 2))
        }
      >
        Скачать JSON
      </button>
      {items.map((i) => (
        <details>
          <summary>
            {i.at.slice(0, 16).replace('T', ' ')} UTC · {i.action}
          </summary>
          <pre>{JSON.stringify(i.detail, null, 2)}</pre>
        </details>
      ))}
    </section>
  );
}
export function Admin({ run }: { run: Runner }) {
  const [day, set] = useState(moscowClock().date),
    [text, write] = useState(''),
    [version, v] = useState(-1),
    [msg, say] = useState(''),
    [confirm, ask] = useState(false);
  useEffect(() => {
    let active = true;
    v(-1);
    say('');
    ask(false);
    run(async () => {
      const row = await api<{ version: number; lessons: unknown[] }>(
        'admin/day?day=' + day,
      );
      if (active) {
        write(JSON.stringify(row.lessons, null, 2));
        v(row.version);
      }
    });
    return () => {
      active = false;
    };
  }, [day]);
  return (
    <section class="rq-card">
      <h2>Расписание группы</h2>
      <label>
        Дата
        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (e.currentTarget.value) set(e.currentTarget.value);
          }}
        />
      </label>
      <p>
        Пустой список отменяет учебный день. Изменения действуют для всей
        группы.
      </p>
      <textarea
        aria-label="Занятия в JSON"
        rows={14}
        value={text}
        onInput={(e) => {
          write(e.currentTarget.value);
          ask(false);
        }}
      />
      <div class="inline">
        <button
          disabled={version < 0}
          onClick={() => {
            if (!confirm) {
              ask(true);
              return;
            }
            run(async () => {
              await api('calendar', {
                day,
                version,
                lessons: JSON.parse(text),
              });
              v(version + 1);
              ask(false);
              say('Опубликовано');
            });
          }}
        >
          {confirm ? 'Подтвердить публикацию' : 'Опубликовать дату'}
        </button>
        <button
          onClick={() =>
            run(async () =>
              download(
                'calendar-backup.json',
                JSON.stringify(await api('calendar'), null, 2),
              ),
            )
          }
        >
          Скачать изменения
        </button>
      </div>
      {msg && <p>{msg}</p>}
    </section>
  );
}

export function Oracle({ d, run }: { d: Desk; run: Runner }) {
  const [list, show] = useState<{ id: number; title: string; at: string }[]>(
      [],
    ),
    [at, time] = useState(d.date + 'T05:40'),
    [msg, say] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => {
      api<typeof list>('oracle/notices')
        .then((v) => {
          if (live) show(v);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  return (
    <section class="rq-card">
      <h2>Oracle</h2>
      {list.length ? (
        list.slice(0, 8).map((n) => (
          <p>
            {n.title} <small>{n.at.slice(0, 16)} UTC</small>
          </p>
        ))
      ) : (
        <p>Уведомлений пока нет.</p>
      )}
      <h2>Проверить правило</h2>
      <input
        type="datetime-local"
        aria-label="Тестовое время МСК"
        value={at}
        onChange={(e) => time(e.currentTarget.value)}
      />
      {d.records
        .filter((r) => r.kind === 'rule')
        .map((r) => (
          <button
            onClick={() =>
              run(async () => {
                const v = await api<{ message: string | null }>('oracle/test', {
                  id: r.id,
                  at,
                });
                say(v.message ?? 'В это время условия не выполнены');
              })
            }
          >
            {String(r.data.title)}
          </button>
        ))}
      {msg && <p>{msg}</p>}
    </section>
  );
}

export function AdminCatalog({ run }: { run: Runner }) {
  type Item = {
    id: string;
    short: string;
    full: string;
    teacher: string;
    version: number;
  };
  const empty: Item = { id: '', short: '', full: '', teacher: '', version: 0 };
  const [items, list] = useState<Item[]>([]),
    [form, set] = useState<Item>(empty),
    [confirm, ask] = useState(false),
    [msg, say] = useState('');
  async function load() {
    list(await api('catalog'));
  }
  useEffect(() => {
    run(load);
  }, []);
  return (
    <section class="rq-card">
      <h2>Публичные дисциплины и преподаватели</h2>
      <select
        aria-label="Публичный предмет"
        value={items.some((i) => i.id === form.id) ? form.id : ''}
        onChange={(e) => {
          set(items.find((i) => i.id === e.currentTarget.value) ?? empty);
          ask(false);
        }}
      >
        <option value="">Новый предмет</option>
        {items.map((i) => (
          <option value={i.id}>{i.short}</option>
        ))}
      </select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirm) {
            ask(true);
            return;
          }
          run(async () => {
            await api('catalog', form);
            await load();
            set({ ...form, version: form.version + 1 });
            ask(false);
            say('Карточка опубликована');
          });
        }}
      >
        {(['id', 'short', 'full', 'teacher'] as const).map((k) => (
          <label>
            {
              {
                id: 'Идентификатор',
                short: 'Кратко',
                full: 'Полное название',
                teacher: 'Преподаватель',
              }[k]
            }
            <input
              required={k !== 'teacher'}
              disabled={k === 'id' && items.some((i) => i.id === form.id)}
              value={form[k]}
              onInput={(e) => {
                set({ ...form, [k]: e.currentTarget.value });
                ask(false);
              }}
            />
          </label>
        ))}
        <button>
          {confirm ? 'Подтвердить публикацию' : 'Сохранить для группы'}
        </button>
      </form>
      {msg && <p>{msg}</p>}
    </section>
  );
}
