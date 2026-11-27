import { useState } from 'preact/hooks';
import { api, type Desk, type Identity } from './client';
import {
  clearDrafts,
  clearVault,
  createVault,
  hasVault,
  lock,
  opened,
  snapshotDesk,
  unlock,
  writeDraft,
} from './vault';

export function Offline({
  u,
  d,
  reload,
}: {
  u?: Identity;
  d?: Desk;
  reload?: () => Promise<void>;
}) {
  const [pw, phrase] = useState(''),
    [msg, say] = useState(''),
    [snap, show] = useState(opened()),
    [title, task] = useState(''),
    [remove, ask] = useState(false),
    [busy, set] = useState(false);
  async function act(fn: () => Promise<void>) {
    set(true);
    say('');
    try {
      await fn();
      show(opened());
      phrase('');
    } catch (e) {
      say((e as Error).message);
    } finally {
      set(false);
    }
  }
  if (!u && !hasVault()) return null;
  const own = snap && (!u || snap.user === u.username);
  return (
    <section class="rq-card">
      <h2>В электричке</h2>
      {!snap && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              if (hasVault()) {
                const s = await unlock(pw);
                if (u && s.user !== u.username) {
                  lock();
                  throw Error('Копия другого аккаунта');
                }
              } else if (u && d) {
                await navigator.serviceWorker.register('/account/worker.js', {
                  scope: '/account/',
                });
                await navigator.serviceWorker.ready;
                await createVault(pw, u, d);
              }
            });
          }}
        >
          <p>
            Расписание выбранного дня, задачи и рейсы можно сохранить на этом
            устройстве с отдельной фразой для офлайн-доступа.
          </p>
          <label>
            Фраза офлайн-доступа
            <input
              type="password"
              autoComplete="off"
              minLength={12}
              required
              value={pw}
              onInput={(e) => phrase(e.currentTarget.value)}
            />
          </label>
          <button disabled={busy}>
            {hasVault() ? 'Открыть сохранённую копию' : 'Сохранить для дороги'}
          </button>
        </form>
      )}
      {own && (
        <>
          <p>
            Снимок за {snap.day} · сохранён{' '}
            {new Date(snap.at).toLocaleString('ru-RU')}
          </p>
          <details open={!u}>
            <summary>Уроки, рейсы и задачи</summary>
            {snap.lessons.map((l) => (
              <p>
                {l.start} – {l.end} · {l.title}
              </p>
            ))}
            {snap.trips.map((t) => (
              <p>
                Рейс {String(t.data.number)} · {String(t.data.departure)} –{' '}
                {String(t.data.arrival)}
                {t.data.cancelled ? ' · отменён' : ''}
              </p>
            ))}
            {snap.tasks.map((t) => (
              <p>
                {t.title} · {t.due}
              </p>
            ))}
          </details>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await writeDraft({
                  kind: 'task',
                  id: crypto.randomUUID(),
                  version: 0,
                  data: { title, due: snap.day, category: 'personal' },
                });
                task('');
              });
            }}
          >
            <label>
              Задача в офлайн-черновики
              <input
                maxLength={180}
                required
                value={title}
                onInput={(e) => task(e.currentTarget.value)}
              />
            </label>
            <button disabled={busy}>Записать</button>
          </form>
          <p>Черновиков на устройстве · {snap.drafts.length}</p>
          {u && d && (
            <button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  if (snap.drafts.length) {
                    await api('offline/sync', { changes: snap.drafts });
                    await clearDrafts(snap.drafts.map((x) => x.id));
                  }
                  const fresh = await api<Desk>('workspace?day=' + d.date);
                  await snapshotDesk(u, fresh);
                  await reload?.();
                  say('Копия и черновики синхронизированы');
                })
              }
            >
              Синхронизировать
            </button>
          )}
          <button
            onClick={() => {
              lock();
              show(null);
            }}
          >
            Закрыть копию
          </button>
        </>
      )}
      {hasVault() && own && (
        <button
          onClick={() => {
            if (!remove) {
              ask(true);
              return;
            }
            clearVault();
            show(null);
            ask(false);
          }}
        >
          {' '}
          {remove
            ? 'Подтвердить удаление копии с черновиками'
            : 'Удалить копию с устройства'}
        </button>
      )}
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
