import { useMemo, useState } from 'preact/hooks';
import {
  counted,
  percentage,
  studyInsights,
  type Counts,
} from './studyInsights';
import type { Desk } from './client';

const fmt = (n: number) =>
  n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const pct = (n: number | null) => (n === null ? '—' : fmt(n) + '%');
const dateLabel = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
function Breakdown({ title, c }: { title: string; c: Counts }) {
  const n = percentage(c);
  return (
    <li>
      <div>
        <strong>{title}</strong>
        <b>{pct(n)}</b>
      </div>
      <progress
        max={100}
        value={n ?? 0}
        aria-label={'Посещаемость · ' + title}
      />
      <small>
        Посещено {c.present + c.late} из {counted(c)} · пропуски {c.absent} ·
        опоздания {c.late}
        {c.excused ? ' · уважительные ' + c.excused : ''}
      </small>
    </li>
  );
}
export function Statistics({ d, journal }: { d: Desk; journal: () => void }) {
  const [length, choose] = useState(28);
  const [group, by] = useState<'subject' | 'day'>('subject');
  const end = d.date < d.today ? d.date : d.today;
  const { start, current, previous } = useMemo(
    () => studyInsights(d.records, end, length),
    [d.records, end, length],
  );
  const total = current.total,
    rate = percentage(total),
    prev = percentage(previous.total);
  const delta =
    rate === null || prev === null ? null : Math.round((rate - prev) * 10) / 10;
  const subjects = [...current.subjects.entries()].sort(
    (a, b) => (percentage(a[1]) ?? 101) - (percentage(b[1]) ?? 101),
  );
  return (
    <section class="rq-card study-stats">
      <h2>Посещаемость за период</h2>
      <div class="rq-segment" aria-label="Период статистики">
        {[7, 28, 90].map((n) => (
          <button key={n} aria-pressed={length === n} onClick={() => choose(n)}>
            {n} дней
          </button>
        ))}
      </div>
      <p class="subtle">
        {dateLabel(start)} — {dateLabel(end)}
      </p>
      {!current.days ? (
        <div class="study-empty">
          <h3>За эти дни нет отметок</h3>
          <p>Заполни прошедшие уроки или выбери другой период.</p>
          <button onClick={journal}>Открыть журнал</button>
        </div>
      ) : (
        <>
          <div class="study-rate">
            <strong>{pct(rate)}</strong>
            <span>
              Посещено {total.present + total.late} из {counted(total)} уроков
            </span>
          </div>
          <small>
            {delta === null
              ? 'Для сравнения нужны учтённые уроки в обоих периодах.'
              : (delta > 0 ? '+' : '') +
                fmt(delta) +
                ' п. п. к предыдущим ' +
                length +
                ' дням (' +
                pct(prev) +
                ', уроков: ' +
                counted(previous.total) +
                ')'}
          </small>
          <div class="study-numbers">
            {[
              ['Дней с отметками', current.days],
              ['Пропущено уроков', total.absent],
              ['Минут пропущено', current.missedMinutes],
              ['Опозданий', total.late],
              ['По уважительной', total.excused],
              ['Предметов', subjects.length],
            ].map(([label, value]) => (
              <div key={label}>
                <b>{value}</b>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <div class="rq-segment">
            <button
              aria-pressed={group === 'subject'}
              onClick={() => by('subject')}
            >
              По предметам
            </button>
            <button aria-pressed={group === 'day'} onClick={() => by('day')}>
              По дням недели
            </button>
          </div>
          {group === 'day' &&
            current.weeklyDates.some((w) => w.missed >= 2) && (
              <div class="study-pattern">
                <strong>Повторяющиеся пропуски</strong>
                {current.weeklyDates.map(
                  (w, i) =>
                    w.missed >= 2 && (
                      <p key={i}>
                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i]} · хотя
                        бы один пропуск в {w.missed} из {w.logged} отмеченных
                        дней.
                      </p>
                    ),
                )}
              </div>
            )}
          <ul class="study-bars">
            {group === 'subject'
              ? subjects.map(([id, c]) => (
                  <Breakdown
                    key={id}
                    title={d.subjects[id]?.full ?? id}
                    c={c}
                  />
                ))
              : current.weekdays.map(
                  (c, i) =>
                    counted(c) + c.excused > 0 && (
                      <Breakdown
                        key={i}
                        title={
                          [
                            'Понедельник',
                            'Вторник',
                            'Среда',
                            'Четверг',
                            'Пятница',
                            'Суббота',
                            'Воскресенье',
                          ][i]
                        }
                        c={c}
                      />
                    ),
                )}
          </ul>
        </>
      )}
      <small>
        Расчёт по отмеченным урокам. Опоздание считается посещением.
        Уважительные и незаполненные уроки исключены из процента.
      </small>
    </section>
  );
}
