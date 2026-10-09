// Каркас приложения: раскладки телефона и планшета, навигация, шторки.

import { useCallback, useMemo, useState } from 'preact/hooks';
import { useSettings } from '../state/settings';
import { OverlayHost } from '../ui/OverlayHost';
import { openSheet } from '../ui/overlays';
import { haptic } from '../ui/haptics';
import { IconButton } from '../ui/controls';
import { TodayView } from '../views/today/TodayView';
import { WeekView } from '../views/week/WeekView';
import { HomeworkView } from '../views/homework/HomeworkView';
import { NotesView } from '../views/notes/NotesView';
import { SettingsView, settingsTitle } from '../views/settings/SettingsView';
import { SubjectCard } from '../views/SubjectCard';
import { PlusSheet } from '../views/PlusSheet';
import { UpcomingAside } from '../views/UpcomingAside';
import {
  ActionsContext, AppDataContext, LayoutContext, pendingHomework, type AppActions, type AppData, type Layout,
} from './app';
import { ClockContext, type ClockSource } from './clock';
import { goBack, useRoute, type Route } from './nav';
import { Stack, type BackInfo } from './Stack';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { useMediaQuery } from './useMediaQuery';
import './shell.css';

const TITLES: Record<string, string> = { today: 'Сегодня', week: 'Неделя', homework: 'ДЗ', notes: 'Заметки' };

function titleOf(route: Route): string {
  return route.tab === 'settings' ? settingsTitle(route.path) : TITLES[route.tab];
}

function renderRoute(route: Route, back: BackInfo | undefined) {
  switch (route.tab) {
    case 'today':
      return <TodayView />;
    case 'week':
      return <WeekView />;
    case 'homework':
      return <HomeworkView />;
    case 'notes':
      return <NotesView />;
    case 'settings':
      return <SettingsView path={route.path} back={back} />;
  }
}

/** Контексты приложения без каркаса — чтобы показывать отдельные блоки (например, на странице превью). */
export function AppProviders(props: { data: AppData; clock: ClockSource; layout?: Layout; actions?: Partial<AppActions>; children: preact.ComponentChildren }) {
  const actions: AppActions = {
    openSubject: (id) => openSheet({ label: 'Карточка предмета', content: () => <SubjectCard id={id} /> }),
    openPlus: () => openSheet({ title: 'Создать', content: () => <PlusSheet /> }),
    ...props.actions,
  };
  return (
    <ClockContext.Provider value={props.clock}>
      <AppDataContext.Provider value={props.data}>
        <LayoutContext.Provider value={props.layout ?? 'phone'}>
          <ActionsContext.Provider value={actions}>{props.children}</ActionsContext.Provider>
        </LayoutContext.Provider>
      </AppDataContext.Provider>
    </ClockContext.Provider>
  );
}

interface Props {
  data: AppData;
  clock: ClockSource;
  /** Принудительная раскладка (для превью). */
  forceLayout?: Layout;
}

export function AppShell({ data, clock, forceLayout }: Props) {
  const tablet = useMediaQuery('(min-width: 768px)');
  const wide = useMediaQuery('(min-width: 1100px)');
  const layout: Layout = forceLayout ?? (wide ? 'wide' : tablet ? 'tablet' : 'phone');
  const route = useRoute();
  const settings = useSettings();
  const [asideSubject, setAsideSubject] = useState<string | null>(null);

  const openPlus = useCallback(() => {
    haptic();
    openSheet({ title: 'Создать', content: () => <PlusSheet /> });
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      openSubject(id) {
        if (layout === 'wide') setAsideSubject(id);
        else openSheet({ label: 'Карточка предмета', content: () => <SubjectCard id={id} /> });
      },
      openPlus,
    }),
    [layout, openPlus],
  );

  const homeworkCount = pendingHomework(data);
  const classes = ['shell', `shell--${layout}`];
  if (layout !== 'phone' && settings.sidebarCollapsed) classes.push('is-collapsed');

  return (
    <ClockContext.Provider value={clock}>
      <AppDataContext.Provider value={data}>
        <LayoutContext.Provider value={layout}>
          <ActionsContext.Provider value={actions}>
            <div class={classes.join(' ')}>
              {layout !== 'phone' && <Sidebar active={route.tab} homeworkCount={homeworkCount} onPlus={openPlus} />}
              <main class="shell__main">
                <Stack
                  route={route}
                  settingsOverToday={layout === 'phone'}
                  render={renderRoute}
                  titleOf={titleOf}
                  onBack={(parent) => goBack(parent)}
                />
              </main>
              {layout === 'wide' && (
                <aside class="shell__aside" aria-label={asideSubject ? 'Карточка предмета' : 'Ближайшее'}>
                  {asideSubject ? (
                    <div class="aside-panel">
                      <div class="aside-panel__close">
                        <IconButton icon="x" label="Закрыть карточку" size={36} onClick={() => setAsideSubject(null)} />
                      </div>
                      <SubjectCard id={asideSubject} inSheet={false} />
                    </div>
                  ) : (
                    <UpcomingAside />
                  )}
                </aside>
              )}
              {layout === 'phone' && <TabBar active={route.tab} homeworkCount={homeworkCount} onPlus={openPlus} />}
              <OverlayHost />
            </div>
          </ActionsContext.Provider>
        </LayoutContext.Provider>
      </AppDataContext.Provider>
    </ClockContext.Provider>
  );
}
