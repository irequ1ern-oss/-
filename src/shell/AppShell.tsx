// Каркас приложения: раскладки телефона и планшета, навигация, шторки.

import type { RefObject } from 'preact';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useSettings } from '../state/settings';
import { OverlayHost } from '../ui/OverlayHost';
import { openSheet } from '../ui/overlays';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { TodayView } from '../views/today/TodayView';
import { WeekView } from '../views/week/WeekView';
import { HomeworkView } from '../views/homework/HomeworkView';
import { NotesView } from '../views/notes/NotesView';
import { SettingsView, settingsTitle } from '../views/settings/SettingsView';
import { SubjectCard } from '../views/SubjectCard';
import { PlusSheet } from '../views/PlusSheet';
import { UpcomingAside } from '../views/UpcomingAside';
import {
  ActionsContext, AppDataContext, LayoutContext, type AppActions, type AppData, type Layout,
} from './app';
import { usePendingHomework } from '../views/homework/store';
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

/** Левый край содержимого открытого экрана — по нему сдвигаем колонку, когда меню сворачивают. */
function contentLeft(main: HTMLElement): number {
  return (main.querySelector('.stack__layer.is-top .screen__body') ?? main).getBoundingClientRect().left;
}

/** Длительность из CSS-переменной: «450ms» или «.45s» (так её может записать сборка). */
function cssTime(value: string): number {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return 0;
  return /ms\s*$/.test(value) ? n : n * 1000;
}

/**
 * Меню свернули или развернули: ширина колонки меняется сразу (раскладка не анимируется),
 * а содержимое плавно доезжает на новое место через transform — вслед за краем меню.
 */
function useSlideOnCollapse(main: RefObject<HTMLElement>, collapsed: boolean, layout: Layout) {
  const last = useRef({ collapsed, layout, from: null as number | null });
  const running = useRef<Animation | null>(null);
  // Где было содержимое — меряем во время отрисовки, пока на странице ещё старая раскладка.
  if (last.current.collapsed !== collapsed || last.current.layout !== layout) {
    const sameLayout = last.current.layout === layout;
    last.current = { collapsed, layout, from: sameLayout && main.current ? contentLeft(main.current) : null };
  }
  useLayoutEffect(() => {
    const el = main.current;
    const from = last.current.from;
    last.current.from = null;
    if (!el || from === null || typeof el.animate !== 'function') return;
    running.current?.cancel();
    const dx = from - contentLeft(el);
    if (Math.abs(dx) < 1) return;
    const css = getComputedStyle(el);
    running.current = el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], {
      duration: cssTime(css.getPropertyValue('--dur-3')),
      easing: css.getPropertyValue('--ease-ios').trim() || 'ease',
    });
  }, [collapsed, layout]);
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
  const main = useRef<HTMLElement>(null);

  // Карточка предмета в правой колонке относится к текущему разделу: в другом разделе — снова «Ближайшее».
  useLayoutEffect(() => setAsideSubject(null), [route.tab]);

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

  const homeworkCount = usePendingHomework(data.homework);
  const collapsed = layout !== 'phone' && settings.sidebarCollapsed;
  useSlideOnCollapse(main, collapsed, layout);
  const classes = ['shell', `shell--${layout}`];
  if (collapsed) classes.push('is-collapsed');

  return (
    <ClockContext.Provider value={clock}>
      <AppDataContext.Provider value={data}>
        <LayoutContext.Provider value={layout}>
          <ActionsContext.Provider value={actions}>
            <div class={classes.join(' ')}>
              {layout !== 'phone' && <Sidebar active={route.tab} homeworkCount={homeworkCount} onPlus={openPlus} />}
              <main class="shell__main" ref={main}>
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
                      <button
                        class="navbar__back aside-panel__back pressable-dim"
                        aria-label="Назад: Ближайшее"
                        onClick={() => setAsideSubject(null)}
                      >
                        <Icon name="caret-left" size={22} weight="regular" />
                        <span>Ближайшее</span>
                      </button>
                      <SubjectCard id={asideSubject} inSheet={false} />
                    </div>
                  ) : (
                    // На экране «ДЗ» список ДЗ уже в середине — справа только события.
                    <UpcomingAside hideHomework={route.tab === 'homework'} />
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
