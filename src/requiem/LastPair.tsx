import { useEffect, useState } from 'preact/hooks';
import { api, hm, mins, type Desk, type Plan } from './client';

interface Sample {
  subject: string;
  attended: number;
  total: number;
  unit: string;
  target: number;
  remaining: number | null;
  reserve: number | null;
  followups: number;
  observations: number;
}
interface Alternative {
  kind: 'lesson' | 'pair';
  starts: string[];
  plan: Plan;
  samples: Sample[];
}
interface Comparison {
  full: Plan;
  alternatives: Alternative[];
}

function journey(plan: Plan) {
  if (plan.end === null) return 'Поездка в колледж не потребуется';
  if (!plan.train) return 'На дату нет подходящего рейса';
  const arrival =
    plan.train.home === null
      ? 'на станции в ' + hm(plan.train.arr)
      : 'дома в ' + hm(plan.train.home);
  return 'Электричка в ' + hm(plan.train.dep) + ' · ' + arrival;
}

export function LastPair({
  d,
  strategy,
  select,
}: {
  d: Desk;
  strategy: string;
  select: (starts: string[]) => void;
}) {
  const [result, show] = useState<Comparison | null>(null);
  const [error, fail] = useState('');
  useEffect(() => {
    const req = new AbortController();
    show(null);
    fail('');
    api<Comparison>(
      'last-pair?day=' + d.date + '&strategy=' + encodeURIComponent(strategy),
      undefined,
      req.signal,
    )
      .then((data) => {
        if (!req.signal.aborted) show(data);
      })
      .catch((e) => {
        if (!req.signal.aborted) fail(e.message);
      });
    return () => req.abort();
  }, [d, strategy]);

  if (!d.lessons.length) return null;
  return (
    <section class="rq-card">
      <h2>Оставаться на последнюю пару?</h2>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            <strong>До конца дня · {hm(result.full.end)}</strong>
            <br />
            {journey(result.full)}
          </p>
          <div class="rq-choices">
            {result.alternatives.map(({ kind, starts, plan, samples }) => {
              const unknown = samples.some(
                (s) => !s.total || s.remaining === null,
              );
              const verdict = plan.blocked.length
                ? 'Лучше прийти'
                : !samples.every((s) => s.total)
                  ? 'Мало отметок для оценки'
                  : plan.net === null
                    ? 'Не хватает данных о дороге'
                    : plan.net <= 0
                      ? 'Уход не даёт чистой экономии'
                      : unknown
                        ? 'Резерв до конца семестра неизвестен'
                        : 'Сценарий укладывается в лимиты';
              return (
                <article key={kind} class="rq-scenario">
                  <h3>
                    {kind === 'lesson'
                      ? 'Пропустить последний урок'
                      : 'Пропустить всю пару'}
                  </h3>
                  <p>
                    {starts.join(' / ')} ·{' '}
                    {samples
                      .map((s) => d.subjects[s.subject]?.short ?? s.subject)
                      .join(' и ')}
                  </p>
                  <strong>{verdict}</strong>
                  <p>
                    {journey(plan)}
                    <br />
                    Чистая экономия · {mins(plan.net)}. На восполнение заложено{' '}
                    {plan.makeup} мин.
                  </p>
                  <details>
                    <summary>Посещаемость и основания</summary>
                    {samples.map((s) => (
                      <p key={s.subject}>
                        {d.subjects[s.subject]?.short ?? s.subject} · посещено{' '}
                        {s.attended} из {s.total} ({s.unit}). Цель {s.target}%.
                        {s.remaining === null
                          ? ' Остаток занятий не задан.'
                          : ' Доступный резерв: ' + s.reserve + '.'}
                        {s.observations > 0 &&
                          ' В личных наблюдениях отработка или долг встречались ' +
                            s.followups +
                            ' из ' +
                            s.observations +
                            ' раз.'}
                      </p>
                    ))}
                    {plan.impacts.map((s) => (
                      <p key={s.subject}>
                        {d.subjects[s.subject]?.short ?? s.subject} · после
                        сценария {s.after}%.
                      </p>
                    ))}
                    {[...plan.blocked, ...plan.unknown, ...plan.reasons].map(
                      (reason) => (
                        <p key={reason}>{reason}</p>
                      ),
                    )}
                  </details>
                  <button onClick={() => select(starts)}>
                    Подставить в симулятор
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
