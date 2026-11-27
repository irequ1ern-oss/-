// Приложение «Учёба»: настоящее расписание и московское время.
// Для проверки можно открыть с ?now=2026-10-12T10:17 — часы пойдут с этого момента.

import { render } from 'preact';
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/base.css';
import { mainSchedule, mainScheduleErrors, scheduleSources } from './data/schedule';
import { watchCalendar, watchSubjects } from './data/calendar';
import { initSettings } from './state/settings';
import { AppShell } from './shell/AppShell';
import { clockFromUrl } from './shell/clock';
import type { AppData } from './shell/app';
import { showToast } from './ui/overlays';
import { setupPwa } from './pwa';

initSettings();

// Дневник пользователя загружается с устройства после запуска.
const data: AppData = { main: mainSchedule, src: scheduleSources, homework: [], events: [], demo: false };

const clock = clockFromUrl();
const draw = (current: AppData) => render(<AppShell data={current} clock={clock} />, document.getElementById('app')!);
draw(data);
if (__CALENDAR_URL__) {
  let current = data;
  const updatedMain = { ...mainSchedule };
  watchSubjects(__CALENDAR_URL__, mainSchedule, subjects => {
    updatedMain.subjects = subjects;
    current = { ...current, main: updatedMain, src: { ...current.src, main: updatedMain } };
    draw(current);
    window.dispatchEvent(new Event('public-catalog-updated'));
  });
  watchCalendar(__CALENDAR_URL__, updatedMain, periods => {
    current = { ...current, src: { ...current.src, periods } };
    draw(current);
  });
}
setupPwa();

if (mainScheduleErrors.length) {
  console.error('Ошибки в data/schedule.json:', mainScheduleErrors);
  showToast({ text: `Ошибка в расписании: ${mainScheduleErrors[0]}`, icon: 'info', duration: 10_000 });
}
