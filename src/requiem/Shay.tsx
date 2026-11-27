import { useEffect, useRef, useState } from 'preact/hooks';
import { api, apiResponse, hm } from './client';
import { readEvents } from './stream';
import type { Edit } from './Desk';
interface Call {
  name: string;
  proposal?: string;
  change?: unknown;
  plans?: {
    minutes: number;
    net: number | null;
    end: number | null;
    blocked: string[];
    unknown: string[];
    reasons: string[];
  }[];
}
interface Message {
  id: number;
  question: string;
  answer: string;
  tools: Call[];
}
export function Shay({
  edit,
  reload,
}: {
  edit: Edit;
  reload: () => Promise<void>;
}) {
  const [items, set] = useState<Message[]>([]),
    [text, write] = useState(''),
    [error, fail] = useState(''),
    [busy, work] = useState(false);
  const [partial, setPartial] = useState(''),
    [actions, setActions] = useState<string[]>([]);
  const [useHistory, setHistory] = useState(true),
    [attachment, attach] = useState<{ name: string; text: string } | null>(
      null,
    );
  const [applied, markApplied] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    api<Message[]>('ai/history')
      .then((x) => {
        if (alive) set(x);
      })
      .catch((e) => {
        if (alive) fail(e.message);
      });
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, []);
  async function ask(question: string) {
    if (!question.trim() || controller.current) return;
    work(true);
    setPartial('');
    setActions([]);
    fail('');
    const req = new AbortController();
    controller.current = req;
    try {
      const response = await apiResponse(
        'ai/ask',
        {
          text: question,
          stream: true,
          include_history: useHistory,
          attachment: attachment?.text ?? '',
        },
        req.signal,
      );
      if (!response.body) throw Error('Браузер не вернул поток ответа');
      let complete = false;
      for await (const event of readEvents(response.body)) {
        if (event.type === 'error') throw Error(event.detail);
        if (event.type === 'delta') setPartial((s) => s + event.text);
        if (event.type === 'tool') {
          setPartial('');
          setActions((items) => [...items, event.name]);
        }
        if (event.type === 'complete') {
          complete = true;
          set((s) => [
            ...s,
            {
              id: Date.now(),
              question,
              answer: event.answer,
              tools: event.tools,
            },
          ]);
          write('');
          attach(null);
        }
      }
      if (!complete)
        throw Error(
          'Соединение прервалось до завершения ответа. Запрос сохранён в форме.',
        );
    } catch (e) {
      if (!req.signal.aborted) fail((e as Error).message);
    } finally {
      work(false);
      controller.current = null;
    }
  }
  async function attachText(file?: File) {
    if (!file) return;
    try {
      if (!/\.(txt|md|csv)$/i.test(file.name) || file.size > 24000)
        throw Error('Выбери текстовый файл до 6000 символов');
      const content = await file.text();
      if (!content.trim() || content.length > 6000)
        throw Error('Вложение должно содержать от 1 до 6000 символов');
      attach({ name: file.name, text: content });
      fail('');
    } catch (e) {
      fail((e as Error).message);
    }
  }
  return (
    <section class="rq-card">
      <header>
        <h2>Shay</h2>
        <button onClick={() => edit('chat_settings', 'default')}>
          Модель и стиль
        </button>
      </header>
      {items.map((i) => (
        <article class="chat" key={i.id}>
          <strong>{i.question}</strong>
          <p>{i.answer}</p>
          {i.tools.map((c) => (
            <details>
              <summary>{c.name}</summary>
              {c.plans?.map((plan) => (
                <div class="rq-scenario">
                  <strong>
                    {plan.blocked.length
                      ? 'Ограничение стратегии'
                      : 'Расчёт Chronos'}
                  </strong>
                  <p>
                    Пропущено по сценарию {plan.minutes} мин · Окончание{' '}
                    {hm(plan.end)} · Чистая экономия{' '}
                    {plan.net === null ? 'пока неизвестна' : plan.net + ' мин'}
                  </p>
                  {[...plan.blocked, ...plan.unknown, ...plan.reasons]
                    .slice(0, 4)
                    .map((r) => (
                      <small>{r}</small>
                    ))}
                </div>
              ))}
              {c.proposal && (
                <>
                  <pre>{JSON.stringify(c.change, null, 2)}</pre>
                  <button
                    disabled={applied.includes(c.proposal)}
                    onClick={async () => {
                      try {
                        await api('ai/apply', { id: c.proposal });
                        markApplied((s) => [...s, c.proposal!]);
                        await reload();
                        fail('Изменение применено');
                      } catch (e) {
                        fail((e as Error).message);
                      }
                    }}
                  >
                    {applied.includes(c.proposal)
                      ? 'Применено'
                      : 'Подтвердить изменение'}
                  </button>
                </>
              )}
            </details>
          ))}
          <div class="inline">
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(i.answer)
                  .catch(() => fail('Копирование недоступно'))
              }
            >
              Копировать
            </button>
            <button disabled={busy} onClick={() => ask(i.question)}>
              Повторить
            </button>
          </div>
        </article>
      ))}
      {busy && (
        <article class="chat" aria-busy="true">
          <small role="status">
            {actions.length
              ? 'Вызвано инструментов: ' +
                actions.length +
                ' · ' +
                actions[actions.length - 1]
              : 'Шэй отвечает…'}
          </small>
          {partial && <p>{partial}</p>}
        </article>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <label>
          Запрос к ассистенту
          <textarea
            value={text}
            maxLength={3500}
            placeholder="На какую электричку я успею после последней пары?"
            onInput={(e) => write(e.currentTarget.value)}
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={useHistory}
            onChange={(e) => setHistory(e.currentTarget.checked)}
          />
          Учитывать последние три сообщения с ответами
        </label>
        <label class="file">
          Приложить текст
          <input
            type="file"
            accept=".txt,.md,.csv"
            disabled={busy}
            onChange={(e) => {
              void attachText(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {attachment && (
          <p>
            {attachment.name} · {attachment.text.length} символов{' '}
            <button type="button" onClick={() => attach(null)}>
              Убрать
            </button>
          </p>
        )}
        <small>
          Запрос, выбранный контекст и результаты инструментов передаются
          провайдеру модели.
        </small>
        <div class="inline">
          <button class="primary" disabled={busy || !text.trim()}>
            Спросить
          </button>
          {busy && (
            <button type="button" onClick={() => controller.current?.abort()}>
              Остановить ответ
            </button>
          )}
        </div>
      </form>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
