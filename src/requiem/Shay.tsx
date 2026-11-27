import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './client';
import type { Edit } from './Desk';
interface Call {
  name: string;
  proposal?: string;
  change?: unknown;
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
    fail('');
    const req = new AbortController();
    controller.current = req;
    try {
      const result = await api<{ answer: string; tools: Call[] }>(
        'ai/ask',
        { text: question },
        req.signal,
      );
      set((s) => [...s, { id: Date.now(), question, ...result }]);
      write('');
    } catch (e) {
      if (!req.signal.aborted) fail((e as Error).message);
    } finally {
      work(false);
      controller.current = null;
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
        <article class="chat">
          <strong>{i.question}</strong>
          <p>{i.answer}</p>
          {i.tools.map((c) => (
            <details>
              <summary>{c.name}</summary>
              {c.proposal && (
                <>
                  <pre>{JSON.stringify(c.change, null, 2)}</pre>
                  <button
                    onClick={async () => {
                      try {
                        await api('ai/apply', { id: c.proposal });
                        await reload();
                        fail('Изменение применено');
                      } catch (e) {
                        fail((e as Error).message);
                      }
                    }}
                  >
                    Подтвердить изменение
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
        <small>
          Запрос, недавний диалог и результаты вызванных инструментов передаются
          выбранному провайдеру.
        </small>
        <div class="inline">
          <button class="primary" disabled={busy || !text.trim()}>
            Спросить
          </button>
          {busy && (
            <button type="button" onClick={() => controller.current?.abort()}>
              Прекратить ожидание
            </button>
          )}
        </div>
      </form>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
