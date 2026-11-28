import { Choice, strategies } from './Choice';
import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { moscowClock, toMinutes } from '../core/time';
import { api, download, type Identity, type Desk, type Fields } from './client';
import { Editor } from './Editor';
import {
  Attendance,
  Dashboard,
  layout,
  defaultLayout,
  type Edit,
} from './Desk';
import {
  Admin,
  AdminCatalog,
  ArchiveList,
  Oracle,
  Horizon,
  Journal,
  Reports,
  Simulator,
  Transit,
  Twin,
  type Runner,
} from './Tools';
import { MemoryReview, ResourceSearch } from './Resources';
import { Offline } from './Offline';
import { lock, opened, syncDrafts } from './vault';
import { PushControl } from './PushControl';
import { Shay } from './Shay';
import '../ui/fonts.css';
import './requiem.css';
import './mobile.css';
import { DatePicker } from '../ui/DatePicker';
import { Icon } from '../ui/Icon';
import { Navigation, sections, icons } from './Navigation';
import { Statistics } from './Statistics';
function Brand() {
  return (
    <div class="brand">
      <em aria-hidden="true">ℜ</em>
      <strong>Requiem</strong>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: Identity) => void }) {
  const activate = location.hash === '#activate';
  const [code, setCode] = useState('');
  const [name, set] = useState(''),
    [pwd, password] = useState(''),
    [error, fail] = useState(''),
    [busy, work] = useState(false);
  return (
    <div class="login">
      <form
        class="rq-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          work(true);
          try {
            const u = await api<Identity>(
              activate ? 'activate' : 'login',
              activate
                ? { username: name, password: pwd, code }
                : { username: name, password: pwd },
            );
            if (activate) history.replaceState(null, '', location.pathname);
            onLogin(u);
          } catch (e) {
            fail((e as Error).message);
          } finally {
            work(false);
          }
        }}
      >
        <h1>{activate ? 'Активация аккаунта' : 'Вход в аккаунт'}</h1>
        {activate && (
          <label>
            Одноразовый код из Railway
            <input
              type="password"
              autoComplete="off"
              required
              minLength={32}
              value={code}
              onInput={(e) => setCode(e.currentTarget.value)}
            />
          </label>
        )}
        <label>
          Логин
          <input
            autoComplete="username"
            required
            value={name}
            maxLength={80}
            onInput={(e) => set(e.currentTarget.value)}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            autoComplete={activate ? 'new-password' : 'current-password'}
            minLength={activate ? 12 : 1}
            required
            value={pwd}
            maxLength={128}
            onInput={(e) => password(e.currentTarget.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button class="primary" disabled={busy}>
          {activate ? 'Создать аккаунт' : 'Войти'}
        </button>
        <a
          href={
            new URLSearchParams(location.search).get('from') === 'pages' &&
            location.hostname === 'requiem-api-production.up.railway.app'
              ? 'https://irequ1ern-oss.github.io/-/#/settings'
              : '/#/settings'
          }
        >
          Вернуться к расписанию
        </a>
      </form>
      <Offline />
    </div>
  );
}
function Password() {
  const [old, set] = useState(''),
    [newPwd, change] = useState(''),
    [msg, say] = useState('');
  return (
    <form
      class="rq-card"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('password', { current: old, replacement: newPwd });
          set('');
          change('');
          say('Пароль изменён. Остальные сессии закрыты.');
        } catch (e) {
          say((e as Error).message);
        }
      }}
    >
      <h2>Сменить пароль</h2>
      <label>
        Текущий пароль
        <input
          type="password"
          autoComplete="current-password"
          required
          value={old}
          onInput={(e) => set(e.currentTarget.value)}
        />
      </label>
      <label>
        Новый пароль
        <input
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          value={newPwd}
          onInput={(e) => change(e.currentTarget.value)}
        />
      </label>
      <button>Сменить пароль</button>
      <p>{msg}</p>
    </form>
  );
}
function Account({ u, logout }: { u: Identity; logout: () => void }) {
  const initial = u.owner ? 'desk' : 'admin',
    [page, go] = useState(location.hash.slice(1) || initial),
    [day, date] = useState(moscowClock().date),
    [d, set] = useState<Desk | null>(null),
    [error, fail] = useState(''),
    [busy, work] = useState(false);
  const rev = useRef(0);
  const [assistantPanel, showAssistant] = useState(false);
  const [editor, open] = useState<{
      kind: string;
      id?: string;
      initial?: Fields;
    } | null>(null),
    [menu, showMenu] = useState<'menu' | 'search' | null>(null),
    [study, setStudy] = useState<'journal' | 'stats' | 'subjects'>('journal'),
    [focus, filter] = useState(false);
  const [restore, stage] = useState<{
    format: number;
    records: unknown[];
  } | null>(null);
  const valid = Object.keys(sections).filter((k) =>
    k === 'admin' ? u.admin : k === 'workshop' || u.owner,
  );
  const selected = valid.includes(page) ? page : initial;
  const navigate = (k: string) => {
    if (location.hash.slice(1) !== k) location.hash = k;
    go(k);
    window.scrollTo({ top: 0, behavior: 'instant' });
    showMenu(null);
  };
  const run: Runner = useCallback(async (fn) => {
    try {
      fail('');
      await fn();
    } catch (e) {
      fail((e as Error).message);
    }
  }, []);
  const reload = useCallback(async () => {
    if (!u.owner) return;
    const id = ++rev.current;
    const data = await api<Desk>('workspace?day=' + day);
    if (id !== rev.current) return;
    if (data.username !== u.username) {
      window.dispatchEvent(new Event('session-ended'));
      return;
    }
    set(data);
    if (opened()?.user === u.username && opened()?.drafts.length) {
      await syncDrafts(u.username);
      const fresh = await api<Desk>('workspace?day=' + day);
      if (id === rev.current && fresh.username === u.username) set(fresh);
    }
  }, [day, u.owner, u.username]);
  useEffect(() => {
    set(null);
    void run(reload);
    return () => {
      rev.current++;
    };
  }, [reload]);
  useEffect(() => {
    const nav = () => {
        go(location.hash.slice(1) || initial);
        showMenu(null);
      },
      key = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          showMenu((x) => (x === 'search' ? null : 'search'));
        }
      };
    const online = () => {
      void run(reload);
    };
    addEventListener('hashchange', nav);
    addEventListener('keydown', key);
    addEventListener('online', online);
    return () => {
      removeEventListener('hashchange', nav);
      removeEventListener('keydown', key);
      removeEventListener('online', online);
    };
  }, [reload, initial]);
  const edit: Edit = (kind, id, initial) => {
    showMenu(null);
    open({ kind, id, initial });
  };
  const academy = (view: 'journal' | 'stats') => {
    setStudy(view);
    navigate('academy');
  };
  const props = d ? { d, edit, run, reload } : null;
  function notebook(file: File | undefined) {
    if (file)
      void run(async () => {
        if (file.size > 100000) throw Error('Максимум 100 КБ');
        const text = await file.text();
        edit('note', undefined, {
          title: file.name.replace(/\.md$/i, ''),
          text,
        });
      });
  }
  function records(kinds: string[]) {
    return props && <ArchiveList {...props} kinds={kinds} />;
  }
  const realLogout = () =>
    run(async () => {
      work(true);
      try {
        await api('logout', {});
        logout();
      } finally {
        work(false);
      }
    });
  const nav = valid.map((k) => (
    <button
      key={k}
      aria-current={selected === k ? 'page' : undefined}
      onClick={() => navigate(k)}
    >
      <Icon name={icons[k]} size={19} /> {sections[k]}
    </button>
  ));
  const config = d?.records.find((r) => r.kind === 'workshop')?.data;
  return (
    <div
      class={
        'rq-shell' +
        (config?.compact ? ' compact' : '') +
        (config?.reduced_motion ? ' still' : '') +
        (assistantPanel && selected !== 'shay' ? ' has-assistant' : '')
      }
    >
      <aside class="rq-side">
        {u.owner ? <Brand /> : <h2>Учёба</h2>}
        <nav aria-label="Разделы">{nav}</nav>
        <button onClick={realLogout} disabled={busy}>
          Выйти
        </button>
      </aside>
      <div class="rq-body">
        <header class="rq-top">
          <strong>{sections[selected]}</strong>
          <div class="inline">
            {u.owner && (
              <DatePicker label="Учебная дата" value={day} onChange={date} />
            )}
            {u.owner && selected !== 'shay' && (
              <button
                class="rq-assistant-toggle"
                aria-expanded={assistantPanel}
                onClick={() => showAssistant((v) => !v)}
              >
                Shay
              </button>
            )}
            <button
              onClick={() => showMenu('search')}
              aria-label="Поиск и команды"
            >
              Поиск <kbd>⌘ K</kbd>
            </button>
          </div>
        </header>
        {error && (
          <aside class="rq-error" role="alert">
            {error} <button onClick={() => run(reload)}>Обновить</button>
          </aside>
        )}
        {selected === 'admin' && u.admin && (
          <>
            <Admin run={run} />
            <AdminCatalog run={run} />
          </>
        )}
        {selected === 'workshop' && (
          <>
            <Password />
            <section class="rq-card">
              <h2>Аккаунт</h2>
              <p>
                {u.username} ·{' '}
                {[u.owner ? 'Owner' : '', u.admin ? 'Admin' : '']
                  .filter(Boolean)
                  .join(' / ')}
              </p>
              <button onClick={realLogout}>Выйти</button>
            </section>
          </>
        )}
        {u.owner && !d && !error && <p>Загрузка рабочего пространства…</p>}
        {props && d && (
          <>
            {selected === 'desk' && (
              <Dashboard
                {...props}
                journal={() => academy('journal')}
                stats={() => academy('stats')}
              />
            )}
            {selected === 'academy' && (
              <>
                <div class="rq-segment academy-tabs" aria-label="Разделы учёбы">
                  {(
                    [
                      ['journal', 'Журнал'],
                      ['stats', 'Статистика'],
                      ['subjects', 'Дисциплины'],
                    ] as const
                  ).map(([key, name]) => (
                    <button
                      key={key}
                      aria-pressed={study === key}
                      onClick={() => setStudy(key)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                {study === 'journal' && <Attendance key={d.date} {...props} />}
                {study === 'stats' && (
                  <Statistics d={d} journal={() => setStudy('journal')} />
                )}
                {study === 'subjects' && (
                  <>
                    <Twin d={d} edit={edit} />
                    {records(['grade', 'teacher', 'observation', 'critical'])}
                  </>
                )}
              </>
            )}
            {selected === 'chronos' && (
              <>
                <Simulator key={d.date} {...props} />
                <section class="rq-card">
                  <h2>Активная стратегия</h2>
                  <Choice
                    title="Активная стратегия"
                    options={strategies(d)}
                    value={layout(d).strategy}
                    change={(strategy) => {
                      run(async () => {
                        const item = d.records.find((r) => r.kind === 'layout');
                        await api('changes', {
                          changes: [
                            {
                              kind: 'layout',
                              id: 'default',
                              version: item?.version ?? 0,
                              data: {
                                ...defaultLayout,
                                ...item?.data,
                                strategy,
                              },
                            },
                          ],
                        });
                        await reload();
                      });
                    }}
                  />
                </section>
                {records(['strategy', 'decision'])}
                <Horizon d={d} run={run} />
              </>
            )}
            {selected === 'transit' && <Transit key={d.date} {...props} />}
            {selected === 'tasks' && config?.workload_lab && (
              <section class="rq-card">
                <h2>Deadlock · нагрузка дня</h2>
                {(() => {
                  const due = d.tasks.filter((t) => t.due <= d.date);
                  const estimated = due.reduce(
                    (n, t) =>
                      n + Math.max(0, Number(t.minutes) - Number(t.spent)),
                    0,
                  );
                  const window = d.lessons
                    .slice(1)
                    .reduce(
                      (n, l, i) =>
                        n +
                        Math.max(
                          0,
                          toMinutes(l.start) - toMinutes(d.lessons[i].end),
                        ),
                      0,
                    );
                  return (
                    <p>
                      Дел со сроком к выбранной дате на {estimated} мин. Между
                      уроками {window} мин.{' '}
                      {estimated > window
                        ? 'Для части дел понадобится время вне колледжа.'
                        : ''}
                    </p>
                  );
                })()}
              </section>
            )}
            {selected === 'tasks' && (
              <>
                <section class="rq-card">
                  <header>
                    <h2>Recovery</h2>
                    <button onClick={() => filter(!focus)}>
                      {focus ? 'Все задачи' : 'Focus · в дороге'}
                    </button>
                  </header>
                  {d.tasks
                    .filter((t) => !focus || (t.portable && !t.blocked))
                    .map((t) => (
                      <button class="line" onClick={() => edit('task', t._id)}>
                        {t.title}
                        <small>
                          {t.blocked ? 'Ждёт предыдущую задачу' : t.due} ·{' '}
                          {String(t.minutes)} мин
                        </small>
                      </button>
                    ))}
                </section>
                {records(['task'])}
              </>
            )}
            {selected === 'oracle' && (
              <>
                <Oracle {...props} />
                <PushControl />
                {records(['rule'])}
              </>
            )}
            {selected === 'ledger' && (
              <>
                <Reports key={d.date} {...props} />
                {records(['ledger', 'pulse'])}
              </>
            )}
            {selected === 'sanctum' && (
              <>
                <section class="rq-card">
                  <h2>Материалы</h2>
                  <label class="file">
                    Импорт Markdown
                    <input
                      type="file"
                      accept=".md,.txt"
                      onChange={(e) => notebook(e.currentTarget.files?.[0])}
                    />
                  </label>
                </section>
                <ResourceSearch edit={edit} run={run} />
                {records(['note', 'memory', 'term'])}
                <MemoryReview d={d} run={run} reload={reload} />
                <Journal run={run} />
              </>
            )}
            {selected === 'shay' && <Shay edit={edit} reload={reload} />}
            {selected === 'workshop' && (
              <section class="rq-card">
                <h2>Workshop</h2>
                <button onClick={() => edit('workshop', 'default')}>
                  Вид и экспериментальные функции
                </button>
              </section>
            )}
            {selected === 'workshop' && <Offline u={u} d={d} reload={reload} />}
            {selected === 'workshop' && (
              <section class="rq-card">
                <h2>Мои данные</h2>
                <button
                  onClick={() =>
                    download(
                      'requiem-export.json',
                      JSON.stringify(
                        {
                          format: 1,
                          exported: new Date().toISOString(),
                          records: d.records,
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  Экспортировать JSON
                </button>
                <label class="file">
                  Импорт копии
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      if (f)
                        run(async () => {
                          if (f.size > 700000)
                            throw Error('Файл слишком большой');
                          const data = JSON.parse(await f.text());
                          if (data.format !== 1 || !Array.isArray(data.records))
                            throw Error('Неверный формат копии');
                          stage({ format: 1, records: data.records });
                        });
                    }}
                  />
                </label>
                {restore && (
                  <button
                    onClick={() =>
                      run(async () => {
                        await api('restore', restore);
                        stage(null);
                        await reload();
                      })
                    }
                  >
                    Подтвердить импорт · {restore.records.length} записей
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {assistantPanel && selected !== 'shay' && u.owner && d && (
        <aside class="rq-assistant-panel" aria-label="Ассистент">
          <button onClick={() => showAssistant(false)}>Закрыть панель</button>
          <Shay edit={edit} reload={reload} />
        </aside>
      )}
      <Navigation
        valid={valid}
        selected={selected}
        d={d}
        edit={edit}
        navigate={navigate}
        mode={menu}
        setMode={showMenu}
        academy={academy}
      />
      {editor && d && (
        <Editor
          key={editor.kind + editor.id}
          desk={d}
          {...editor}
          entry={d.records.find(
            (r) => r.kind === editor.kind && r.id === editor.id,
          )}
          closed={() => open(null)}
          saved={reload}
        />
      )}
    </div>
  );
}
function Root() {
  const [user, change] = useState<Identity | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const identity = await api<Identity>('session');
        if (!active) return;
        if (opened() && opened()?.user !== identity.username) lock();
        change(identity);
      } catch {
        if (active)
          change((current) => (current === undefined ? null : current));
      }
    };
    void restore();
    addEventListener('online', restore);
    const reset = () => {
      lock();
      change(null);
    };
    addEventListener('session-ended', reset);
    return () => {
      active = false;
      removeEventListener('online', restore);
      removeEventListener('session-ended', reset);
    };
  }, []);
  useEffect(() => {
    document.title = user?.owner ? 'Requiem' : 'Аккаунт · Учёба';
  }, [user]);
  return user === undefined ? (
    <div class="login">Проверка сессии…</div>
  ) : user ? (
    <Account
      key={user.username}
      u={user}
      logout={() => {
        lock();
        change(null);
        history.replaceState(null, '', location.pathname);
      }}
    />
  ) : (
    <Login
      onLogin={(u) => {
        if (opened()?.user !== u.username) lock();
        change(u);
      }}
    />
  );
}
render(<Root />, document.getElementById('account')!);
