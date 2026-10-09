import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useClock, useMediaQuery, useRoute, clockOverride, type Route } from './hooks';
import { mainScheduleErrors, useScheduleSources } from './data/schedule';
import { applyUpdate, dismissOfflineReady, usePwaState } from './pwa';
import { formatDDMM } from './core/format';
import { TodayScreen } from './screens/TodayScreen';
import { WeekScreen } from './screens/WeekScreen';
import { MoreScreen } from './screens/MoreScreen';
import { SoonScreen } from './screens/SoonScreen';
import { IconHomework, IconMore, IconNotes, IconToday, IconWeek } from './components/Icons';

/** Две колонки: планшет в горизонтальной ориентации или широкий экран ПК. */
const WIDE_QUERY = '(min-width: 900px) and (orientation: landscape), (min-width: 1200px)';

const TABS: { route: Route; label: string; icon: () => preact.JSX.Element }[] = [
  { route: 'today', label: 'Сегодня', icon: IconToday },
  { route: 'week', label: 'Неделя', icon: IconWeek },
  { route: 'homework', label: 'ДЗ', icon: IconHomework },
  { route: 'notes', label: 'Заметки', icon: IconNotes },
  { route: 'more', label: 'Ещё', icon: IconMore },
];

type LeftPane = 'today' | 'week';
type RightPane = 'homework' | 'notes';

export function App() {
  const [route, go] = useRoute();
  const wide = useMediaQuery(WIDE_QUERY);
  const clock = useClock();
  const src = useScheduleSources();
  const [left, setLeft] = useState<LeftPane>(route === 'week' ? 'week' : 'today');
  const [right, setRight] = useState<RightPane>(route === 'notes' ? 'notes' : 'homework');

  useEffect(() => {
    if (route === 'today' || route === 'week') setLeft(route);
    if (route === 'homework' || route === 'notes') setRight(route);
  }, [route]);

  const screen = (r: Route) => {
    switch (r) {
      case 'today':
        return <TodayScreen clock={clock} src={src} />;
      case 'week':
        return <WeekScreen clock={clock} src={src} />;
      case 'homework':
        return <SoonScreen title="ДЗ" text="Домашние задания появятся на этапе 3." />;
      case 'notes':
        return <SoonScreen title="Заметки" text="Заметки и события появятся на этапе 3." />;
      case 'more':
        return <MoreScreen />;
    }
  };

  return (
    <div class={`app${wide ? ' app--wide' : ''}`}>
      {!wide && <Banners />}
      {wide ? (
        <>
          <header class="topbar">
            <span class="topbar__title">Учёба</span>
            <button
              class={`topbar__more${route === 'more' ? ' is-active' : ''}`}
              onClick={() => (route === 'more' ? go(left) : go('more'))}
            >
              <IconMore /> {route === 'more' ? 'Закрыть' : 'Ещё'}
            </button>
          </header>
          <Banners />
          {route === 'more' ? (
            <main class="content">{screen('more')}</main>
          ) : (
            <div class="panes">
              <Pane tabs={TABS.slice(0, 2)} active={left} onSelect={go}>
                {screen(left)}
              </Pane>
              <Pane tabs={TABS.slice(2, 4)} active={right} onSelect={go}>
                {screen(right)}
              </Pane>
            </div>
          )}
        </>
      ) : (
        <>
          <main class="content">{screen(route)}</main>
          <nav class="tabbar" aria-label="Разделы">
            {TABS.map(({ route: r, label, icon: Icon }) => (
              <button
                key={r}
                class={`tabbar__item${route === r ? ' is-active' : ''}`}
                aria-current={route === r ? 'page' : undefined}
                onClick={() => go(r)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

function Pane(props: {
  tabs: typeof TABS;
  active: Route;
  onSelect: (r: Route) => void;
  children: ComponentChildren;
}) {
  return (
    <div class="pane">
      <div class="segmented" role="tablist">
        {props.tabs.map(({ route, label, icon: Icon }) => (
          <button
            key={route}
            role="tab"
            aria-selected={props.active === route}
            class={`segmented__item${props.active === route ? ' is-active' : ''}`}
            onClick={() => props.onSelect(route)}
          >
            <Icon /> {label}
          </button>
        ))}
      </div>
      {props.children}
    </div>
  );
}

function Banners() {
  const pwa = usePwaState();
  return (
    <div class="banners">
      {mainScheduleErrors.length > 0 && (
        <div class="banner banner--error" role="alert">
          <div class="banner__text">
            <strong>Ошибка в data/schedule.json:</strong>
            <ul>
              {mainScheduleErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {clockOverride && (
        <div class="banner banner--info">
          <span class="banner__text">
            Тестовое время: {formatDDMM(clockOverride.date)}{' '}
            {String(Math.floor(clockOverride.minutes / 60)).padStart(2, '0')}:
            {String(clockOverride.minutes % 60).padStart(2, '0')}
          </span>
          <a class="banner__action" href={location.pathname + location.hash}>
            Сбросить
          </a>
        </div>
      )}
      {pwa.needRefresh && (
        <div class="banner banner--info">
          <span class="banner__text">Вышла новая версия приложения.</span>
          <button class="banner__action" onClick={applyUpdate}>
            Обновить
          </button>
        </div>
      )}
      {pwa.offlineReady && (
        <div class="banner banner--ok">
          <span class="banner__text">Приложение готово работать без интернета.</span>
          <button class="banner__action" onClick={dismissOfflineReady}>
            OK
          </button>
        </div>
      )}
    </div>
  );
}
