// Работа без интернета (service worker), обновления и защита данных от очистки.

import { registerSW } from 'virtual:pwa-register';
import { getSettings, updateSettings } from './state/settings';
import { showToast } from './ui/overlays';

/** Как часто проверять обновление, когда приложение возвращают из фона. */
const UPDATE_CHECK_INTERVAL = 30 * 60_000;

export function setupPwa() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Если страницей уже управляет service worker, то смена управляющего — это вышла новая версия.
  // После первой установки флаг тоже становится true: следующая смена — уже обновление.
  let controlled = Boolean(navigator.serviceWorker.controller);
  // После жёсткой перезагрузки (Ctrl+Shift+R) страницей никто не управляет, хотя приложение уже установлено:
  // тогда следующая смена управляющего — тоже обновление.
  navigator.serviceWorker
    .getRegistration()
    .then((r) => {
      if (r?.active) controlled = true;
    })
    .catch(() => undefined);

  registerSW({
    immediate: true,
    // Первый запуск: всё скачано, дальше приложение откроется и без сети. Говорим об этом один раз.
    onOfflineReady() {
      if (getSettings().offlineToastShown) return;
      updateSettings({ offlineToastShown: true });
      showToast({ text: 'Готово: работает без интернета', icon: 'cloud-check' });
    },
    // Без этого плагин сам перезагружает страницу, если новую версию нашло другое окно или проверка из фона.
    // Перезагрузку предлагает тост ниже — пользователь сам решает, когда.
    onNeedReload() {},
    // Телефон и планшет редко перезапускают приложение: оно возвращается из фона без загрузки страницы,
    // и браузер не проверяет обновления. Проверяем сами, когда приложение снова на экране.
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return;
        if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL) return;
        lastCheck = Date.now();
        registration.update().catch(() => undefined);
      });
    },
  });

  // Новая версия включается сама (skipWaiting), но экран ещё старый — предлагаем перезагрузить.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const wasControlled = controlled;
    controlled = true;
    if (!wasControlled) return;
    showToast({
      text: 'Вышла новая версия',
      icon: 'arrows-clockwise',
      actionLabel: 'Обновить',
      onAction: () => location.reload(),
      duration: 15_000,
    });
  });

  // Без этого браузер может стереть данные приложения, когда на устройстве мало места.
  navigator.storage?.persist?.().catch(() => undefined);
}
