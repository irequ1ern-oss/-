import { Choice, contexts } from './Choice';
import { Sheet } from './Sheet';
import { Icon } from '../ui/Icon';
import { useEffect, useRef, useState } from 'preact/hooks';
import { moscowClock, toMinutes } from '../core/time';
import {
  api,
  hm,
  mins,
  type Change,
  type Desk,
  type Fields,
  type Plan,
  words,
} from './client';

export type Edit = (kind: string, id?: string, initial?: Fields) => void;
type Props = {
  d: Desk;
  edit: Edit;
  reload: () => Promise<void>;
  run: (fn: () => Promise<void>) => void;
};
const panels = {
  bells: 'Звонки',
  travel: 'Дорога домой',
  risks: 'Посещаемость',
  tasks: 'Ближайшие дела',
  plan: 'Сценарий дня',
  tomorrow: 'Завтра',
};
export const defaultLayout = {
  context: 'auto',
  order: Object.keys(panels),
  wide: ['bells', 'plan'],
  hidden: [] as string[],
  strategy: 'Balance',
};
export function layout(d: Desk) {
  return {
    ...defaultLayout,
    ...d.records.find((r) => r.kind === 'layout')?.data,
  } as typeof defaultLayout;
}
export function Summary({
  p,
  subjects,
}: {
  p: Plan;
  subjects: Desk['subjects'];
}) {
  return (
    <>
      <strong>
        {p.skip.length
          ? 'Пропустить уроки в ' + p.skip.join(', ')
          : 'Посетить все занятия'}
      </strong>
      <div class="rq-metrics">
        <span>
          Вне колледжа <b>{mins(p.away_saved)}</b>
        </span>
        <span>
          Восполнение <b>{mins(p.makeup)}</b>
        </span>
        <span>
          Чистая экономия <b>{mins(p.net)}</b>
        </span>
      </div>
      {p.train && (
        <p>
          Рейс {p.train.number} в {hm(p.train.dep)} · на станции в{' '}
          {hm(p.train.arr)}
        </p>
      )}
      {p.impacts.map((v) => (
        <p>
          {subjects[v.subject]?.short ?? v.subject} · {v.before ?? '—'}% →{' '}
          {v.after}%
        </p>
      ))}
      {[...p.blocked, ...p.reasons, ...p.unknown].map((s) => (
        <p>{s}</p>
      ))}
    </>
  );
}
export function Dashboard({
  d,
  edit,
  run,
  reload,
  journal,
  stats,
}: Props & { journal: () => void; stats: () => void }) {
  const [clock, tick] = useState(moscowClock());
  useEffect(() => {
    const t = setInterval(() => tick(moscowClock()), 1000);
    return () => clearInterval(t);
  }, []);
  const pref = layout(d),
    current = d.lessons.find(
      (l) => l.start <= hm(clock.minutes) && l.end > hm(clock.minutes),
    ),
    next = d.lessons.find((l) => l.start > hm(clock.minutes));
  const first = d.lessons[0],
    last = d.lessons.at(-1);
  const auto =
    clock.minutes < toMinutes(first?.start ?? '09:00')
      ? 'Dawn'
      : clock.minutes < toMinutes(last?.end ?? '15:00')
        ? 'Execution'
        : clock.minutes < 20 * 60
          ? 'Departure'
          : 'Nocturne';
  const context = pref.context === 'auto' ? auto : pref.context;
  const plan = d.scenario;
  const [custom, customize] = useState(false);
  const update = (patch: Partial<typeof pref>) =>
    run(async () => {
      const entry = d.records.find((r) => r.kind === 'layout');
      await api('changes', {
        changes: [
          {
            kind: 'layout',
            id: 'default',
            version: entry?.version ?? 0,
            data: { ...pref, ...patch },
          },
        ],
      });
      await reload();
    });
  const actions: Record<string, () => preact.ComponentChildren> = {
    bells: () => (
      <>
        {d.date === clock.date && (
          <p class="rq-big">
            {current
              ? Math.ceil((toMinutes(current.end) * 60 - clock.seconds) / 60) +
                ' мин'
              : next
                ? 'В ' + next.start
                : 'Занятия окончены'}
          </p>
        )}
        <p>
          {d.date === clock.date && current
            ? 'До звонка · ' + current.title
            : ''}
        </p>
        <div class="rq-timeline">
          {d.lessons.map((l) => (
            <div class={d.date === clock.date && l === current ? 'active' : ''}>
              <time>{l.start}</time>
              <span>{l.title}</span>
              <small>{l.room}</small>
            </div>
          ))}
          {!first && <p>Свободный день</p>}
        </div>
      </>
    ),
    travel: () => (
      <TravelCard
        d={d}
        clock={clock.minutes + (clock.seconds % 60) / 60}
        edit={edit}
      />
    ),
    risks: () => (
      <>
        {d.stats
          .filter((s) => s.total)
          .slice()
          .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
          .slice(0, 5)
          .map((s) => (
            <p>
              {d.subjects[s.subject].short} <b>{s.percent}%</b>
            </p>
          ))}
        {!d.stats.some((s) => s.total) && (
          <p>Первая отметка в журнале откроет статистику.</p>
        )}
      </>
    ),
    tasks: () => (
      <>
        {d.tasks.slice(0, 4).map((t) => (
          <button class="line" onClick={() => edit('task', t._id)}>
            {t.title}
            <small>{t.due}</small>
          </button>
        ))}
        {!d.tasks.length && <p>Открытых дел нет.</p>}
        <button onClick={() => edit('task')}>Добавить задачу</button>
      </>
    ),
    plan: () =>
      d.lessons.length ? (
        <Summary p={plan} subjects={d.subjects} />
      ) : (
        <p>На выбранный день занятий нет.</p>
      ),
    tomorrow: () => (
      <>
        {d.tomorrow.length ? (
          <p>
            {d.tomorrow[0].start} – {d.tomorrow.at(-1)?.end} ·{' '}
            {d.tomorrow.length} уроков
          </p>
        ) : (
          <p>Занятий нет.</p>
        )}
      </>
    ),
  };
  const preferred: Record<string, string> = {
    Dawn: 'plan',
    Execution: 'bells',
    Departure: 'travel',
    Nocturne: 'tomorrow',
  };
  const ordered = pref.order.filter((k) => k in panels);
  const focus = preferred[context];
  return (
    <>
      <div class="rq-cover">
        <div class="rq-moon" aria-hidden="true" />
        <p>
          {contexts.find((c) => c.id === context)?.label} ·{' '}
          {d.date.split('-').reverse().join('.')}
        </p>
        <h1>
          {
            {
              Dawn: 'Перед дорогой',
              Execution: 'Учебный день',
              Departure: 'Пора домой',
              Nocturne: 'Вечерний обзор',
            }[context]
          }
        </h1>
        <div class="inline">
          <Choice
            title="Режим обзора"
            value={pref.context}
            options={contexts}
            change={(context) => update({ context })}
          />
          <button onClick={() => customize(!custom)}>Компоновка</button>
        </div>
      </div>
      <div class="desk-shortcuts">
        <button onClick={journal}>
          <Icon name="check-circle" size={19} />
          Отметить урок
        </button>
        <button onClick={stats}>
          <Icon name="trend-up" size={19} />
          Посещаемость
        </button>
      </div>
      {custom && (
        <section class="rq-card">
          <h2>Компоновка</h2>
          {ordered.map((k, i) => (
            <div class="line">
              <span>{panels[k as keyof typeof panels]}</span>
              <button
                disabled={i === 0}
                onClick={() => {
                  const a = [...ordered];
                  [a[i - 1], a[i]] = [a[i], a[i - 1]];
                  update({ order: a });
                }}
              >
                Выше
              </button>
              <button
                onClick={() =>
                  update({
                    wide: pref.wide.includes(k)
                      ? pref.wide.filter((x) => x !== k)
                      : [...pref.wide, k],
                  })
                }
              >
                {pref.wide.includes(k) ? 'Уже' : 'Шире'}
              </button>
              <button
                onClick={() =>
                  update({
                    hidden: pref.hidden.includes(k)
                      ? pref.hidden.filter((x) => x !== k)
                      : [...pref.hidden, k],
                  })
                }
              >
                {pref.hidden.includes(k) ? 'Показать' : 'Скрыть'}
              </button>
            </div>
          ))}
        </section>
      )}
      <div class="rq-grid">
        {[...ordered]
          .sort((a, b) =>
            pref.context === 'auto' &&
            !d.records.some((r) => r.kind === 'layout')
              ? Number(b === focus) - Number(a === focus)
              : 0,
          )
          .filter((k) => !pref.hidden.includes(k))
          .map((k) => (
            <section
              key={k}
              class={'rq-card ' + (pref.wide.includes(k) ? 'wide' : '')}
            >
              <h2>{panels[k as keyof typeof panels]}</h2>
              {actions[k]()}
            </section>
          ))}
      </div>
    </>
  );
}
export function TravelCard({
  d,
  clock,
  edit,
}: {
  d: Desk;
  clock: number;
  edit: Edit;
}) {
  const p = d.records.find((e) => e.kind === 'travel')?.data ?? {};
  const access = Number(p.metro ?? 28) + Number(p.walk ?? 12),
    ideal = Number(p.cushion ?? 20),
    boarding = Number(p.boarding ?? 15);
  const train = d.records
    .filter(
      (e) =>
        e.kind === 'trip' &&
        e.data.date === d.date &&
        e.data.direction === 'out' &&
        !e.data.cancelled,
    )
    .map((e) => ({
      ...e,
      dep: toMinutes(String(e.data.departure)) + Number(e.data.delay),
    }))
    .filter(
      (e) =>
        e.dep - access - boarding >=
        (d.date === moscowClock().date ? clock : 0),
    )
    .sort((a, b) => a.dep - b.dep)[0];
  if (!train)
    return (
      <>
        <p>На эту дату доступных обратных рейсов нет.</p>
        <button onClick={() => edit('trip')}>Добавить рейс</button>
      </>
    );
  const leave = train.dep - access - ideal,
    remaining = Math.ceil(leave - clock);
  return (
    <>
      <p>
        {String(p.station ?? 'Вокзал')} →{' '}
        {String(p.destination ?? 'Станция назначения')}
      </p>
      <div class="rq-big">{hm(leave)}</div>
      <p>
        {d.date !== moscowClock().date
          ? 'Комфортный выход'
          : remaining > 0
            ? 'Выйти через ' + remaining + ' мин'
            : remaining === 0
              ? 'Пора выходить'
              : 'Выходи сейчас, запас до посадки сокращается'}
      </p>
      <p>
        Рейс {String(train.data.number)} в {hm(train.dep)} · выход к посадке до{' '}
        {hm(train.dep - access - boarding)}
      </p>
      <small>
        Ручное расписание на {d.date} · запись от {train.updated.slice(0, 10)}
      </small>
    </>
  );
}
export function Attendance({ d, run, reload }: Props) {
  const [active, choose] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, tick] = useState(moscowClock);
  const lock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => tick(moscowClock()), 15000);
    return () => clearInterval(timer);
  }, []);
  const marks = new Map(
    d.records
      .filter((r) => r.kind === 'attendance' && r.data.date === d.date)
      .map((r) => [String(r.data.start), r]),
  );
  const allowed = (start: string) =>
    d.date < now.date ||
    (d.date === now.date && toMinutes(start) <= now.minutes);
  const remaining = d.lessons.filter(
    (l) => allowed(l.start) && !marks.has(l.start),
  );
  const lesson = d.lessons.find((l) => l.start === active);
  function mark(starts: string[], status: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    choose(null);
    run(async () => {
      try {
        const changes: Change[] = d.lessons
          .filter((l) => starts.includes(l.start) && allowed(l.start))
          .map((l) => ({
            id: d.date + '.' + l.start,
            kind: 'attendance',
            version: marks.get(l.start)?.version ?? 0,
            data: {
              date: d.date,
              start: l.start,
              end: l.end,
              subject: l.subject,
              status,
            },
          }));
        if (changes.length) {
          await api('changes', { changes });
          await reload();
        }
      } finally {
        lock.current = false;
        setBusy(false);
      }
    });
  }
  return (
    <section class="rq-card rq-journal">
      <h2>Журнал уроков</h2>
      {d.lessons.length ? (
        <>
          <p>
            Отмечено {d.lessons.filter((l) => marks.has(l.start)).length} из{' '}
            {d.lessons.length} · {d.date.split('-').reverse().join('.')}
          </p>
          {remaining.length > 0 && (
            <button
              class="journal-bulk"
              disabled={busy}
              onClick={() =>
                mark(
                  remaining.map((l) => l.start),
                  'present',
                )
              }
            >
              <Icon name="check" size={18} /> Был на оставшихся ·{' '}
              {remaining.length}
            </button>
          )}
          {d.lessons.map((l) => {
            const status = String(marks.get(l.start)?.data.status ?? '');
            return (
              <div class="journal-row" key={l.start}>
                <div>
                  <small>
                    {l.start} – {l.end}
                    {l.room && ' · ' + l.room}
                  </small>
                  <strong>{l.title}</strong>
                </div>
                <div class="mark-actions">
                  {!status && allowed(l.start) && (
                    <button
                      disabled={busy}
                      aria-label={'Был в ' + l.start}
                      onClick={() => mark([l.start], 'present')}
                    >
                      Был
                    </button>
                  )}
                  <button
                    data-status={status}
                    disabled={busy || !allowed(l.start)}
                    aria-label={
                      'Отметка в ' +
                      l.start +
                      (status ? ' · ' + words[status] : '')
                    }
                    onClick={() => choose(l.start)}
                  >
                    {status
                      ? words[status]
                      : allowed(l.start)
                        ? 'Другая'
                        : 'Позже'}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <p>В расписании на этот день нет уроков.</p>
      )}
      {lesson && (
        <Sheet title={'Отметка · ' + lesson.start} close={() => choose(null)}>
          <p>{lesson.title}</p>
          <div class="mark-options">
            {['present', 'absent', 'late', 'excused'].map((s) => (
              <button
                key={s}
                aria-pressed={marks.get(lesson.start)?.data.status === s}
                onClick={() => mark([lesson.start], s)}
              >
                {words[s]}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}
