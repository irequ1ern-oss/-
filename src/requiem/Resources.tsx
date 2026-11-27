import { useEffect, useState } from 'preact/hooks';
import { api, type Fields } from './client';
import type { Edit } from './Desk';
import type { Runner } from './Tools';
export function ResourceSearch({ edit, run }: { edit: Edit; run: Runner }) {
  const [enabled, enable] = useState(false),
    [q, query] = useState(''),
    [paths, show] = useState<string[]>([]),
    [limited, limit] = useState(false);
  useEffect(() => {
    api<{ enabled: boolean }>('resources/config')
      .then((c) => enable(c.enabled))
      .catch(() => {});
  }, []);
  if (!enabled) return null;
  return (
    <section class="rq-card">
      <h2>Obsidian</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await api<{ paths: string[]; truncated: boolean }>(
              'resources/search?q=' + encodeURIComponent(q),
            );
            show(r.paths);
            limit(r.truncated);
          });
        }}
      >
        <label>
          Название материала
          <input
            value={q}
            maxLength={150}
            onInput={(e) => query(e.currentTarget.value)}
          />
        </label>
        <button>Найти в хранилище</button>
      </form>
      {limited && <p>Уточни поиск, чтобы увидеть остальные материалы.</p>}
      {paths.map((p) => (
        <button
          class="line"
          onClick={() =>
            run(async () =>
              edit(
                'note',
                undefined,
                await api<Fields>(
                  'resources/read?path=' + encodeURIComponent(p),
                ),
              ),
            )
          }
        >
          {p}
        </button>
      ))}
    </section>
  );
}

export function Files({ task }: { task: string }) {
  const [files, show] = useState<{ id: string; name: string; size: number }[]>(
      [],
    ),
    [msg, say] = useState(''),
    [del, ask] = useState('');
  async function reload() {
    show(await api('files?task=' + encodeURIComponent(task)));
  }
  useEffect(() => {
    reload().catch((e) => say(e.message));
  }, [task]);
  return (
    <section>
      <h2>Вложения</h2>
      {files.map((f) => (
        <div class="line">
          <a href={'/api/files/' + f.id} download={f.name}>
            {f.name}
          </a>
          <small>{Math.ceil(f.size / 1024)} КБ</small>
          <button
            onClick={async () => {
              if (del !== f.id) {
                ask(f.id);
                return;
              }
              try {
                await api('files/remove', { id: f.id });
                await reload();
              } catch (e) {
                say((e as Error).message);
              }
            }}
          >
            {del === f.id ? 'Подтвердить' : 'Удалить'}
          </button>
        </div>
      ))}
      <label class="file">
        Прикрепить файл до 500 КБ
        <input
          type="file"
          onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            if (!f) return;
            try {
              if (f.size > 500000) throw Error('Лимит 500 КБ');
              let binary = '';
              for (const c of new Uint8Array(await f.arrayBuffer()))
                binary += String.fromCharCode(c);
              await api('files/add', {
                task,
                name: f.name,
                content: btoa(binary),
              });
              await reload();
            } catch (e) {
              say((e as Error).message);
            }
          }}
        />
      </label>
      {msg && <p>{msg}</p>}
    </section>
  );
}
export function MemoryReview({
  d,
  run,
  reload,
}: {
  d: import('./client').Desk;
  run: Runner;
  reload: () => Promise<void>;
}) {
  const [groups, show] = useState<
      {
        kind: string;
        items: { id: string; version: number; title: string; text: string }[];
      }[]
    >([]),
    [confirm, ask] = useState('');
  useEffect(() => {
    run(async () => show(await api('memory/review')));
  }, [d]);
  if (!groups.length) return null;
  return (
    <section class="rq-card">
      <h2>Проверка памяти</h2>
      {groups.map((g) => (
        <details>
          <summary>
            {g.items[0].title} ·{' '}
            {g.kind === 'duplicate'
              ? 'совпадающие записи'
              : 'разные сведения с одним названием'}
          </summary>
          {g.items.map((i) => (
            <p>{i.text}</p>
          ))}
          <button
            onClick={() => {
              const first = g.items[0],
                other = g.items[1];
              if (confirm !== other.id) {
                ask(other.id);
                return;
              }
              run(async () => {
                await api('memory/merge', {
                  keep: first.id,
                  retire: other.id,
                  version: other.version,
                  keep_version: first.version,
                });
                await reload();
                ask('');
              });
            }}
          >
            {confirm === g.items[1].id
              ? 'Подтвердить архивирование второй'
              : 'Сохранить первую, архивировать вторую'}
          </button>
        </details>
      ))}
    </section>
  );
}
