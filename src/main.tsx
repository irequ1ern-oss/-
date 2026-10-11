// Приложение «Учёба»: настоящее расписание, изменения из памяти устройства и московское время.
// Для проверки можно открыть с ?now=2026-10-12T10:17 — часы пойдут с этого момента.

import { render } from 'preact';
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/base.css';
import { mainSchedule, mainScheduleErrors } from './data/schedule';
import { initChanges } from './state/changes';
import { initSettings } from './state/settings';
import { AppRoot } from './shell/AppRoot';
import { clockFromUrl } from './shell/clock';
import { showToast } from './ui/overlays';
import { setupPwa } from './pwa';

initSettings();

// ДЗ и события появятся на этапе 3 — пока списки пустые (экран «ДЗ» показывает заглушку).
const base = { main: mainSchedule, homework: [], events: [], demo: false };

/** Сколько ждать базу на устройстве перед первой отрисовкой: дольше — показываем экран, изменения подтянутся. */
const STORAGE_WAIT_MS = 3000;

function start() {
  render(<AppRoot base={base} clock={clockFromUrl()} />, document.getElementById('app')!);
  setupPwa();
  if (mainScheduleErrors.length) {
    console.error('Ошибки в data/schedule.json:', mainScheduleErrors);
    showToast({ text: `Ошибка в расписании: ${mainScheduleErrors[0]}`, icon: 'info', duration: 10_000 });
  }
}

// Сначала читаем изменения расписания, чтобы экран не «перепрыгнул» после загрузки.
// Если база не ответила за 3 секунды, рисуем без них: когда она откроется, экраны обновятся сами.
Promise.race([
  initChanges({ backend: 'indexeddb' }),
  new Promise<void>((resolve) => window.setTimeout(resolve, STORAGE_WAIT_MS)),
]).then(start, start);
