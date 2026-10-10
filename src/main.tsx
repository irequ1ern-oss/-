// Приложение «Учёба»: настоящее расписание и московское время.
// Для проверки можно открыть с ?now=2026-10-12T10:17 — часы пойдут с этого момента.

import { render } from 'preact';
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/base.css';
import { mainSchedule, mainScheduleErrors, scheduleSources } from './data/schedule';
import { initSettings } from './state/settings';
import { AppShell } from './shell/AppShell';
import { clockFromUrl } from './shell/clock';
import type { AppData } from './shell/app';
import { showToast } from './ui/overlays';
import { setupPwa } from './pwa';

initSettings();

// ДЗ и события появятся на этапе 3 — пока списки пустые (экран «ДЗ» показывает заглушку).
const data: AppData = { main: mainSchedule, src: scheduleSources, homework: [], events: [], demo: false };

render(<AppShell data={data} clock={clockFromUrl()} />, document.getElementById('app')!);
setupPwa();

if (mainScheduleErrors.length) {
  console.error('Ошибки в data/schedule.json:', mainScheduleErrors);
  showToast({ text: 'В файле расписания ошибка — часть пар может не показываться', icon: 'info', duration: 10_000 });
}
