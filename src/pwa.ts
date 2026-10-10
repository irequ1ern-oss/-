// Работа без интернета (service worker), обновления и защита данных от очистки.

import { registerSW } from 'virtual:pwa-register';
import { getSettings, updateSettings } from './state/settings';
import { showToast } from './ui/overlays';

export function setupPwa() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Если страницей уже управлял service worker, то смена управляющего — это вышла новая версия.
  const hadController = Boolean(navigator.serviceWorker.controller);

  registerSW({
    immediate: true,
    // Первый запуск: всё скачано, дальше приложение откроется и без сети. Говорим об этом один раз.
    onOfflineReady() {
      if (getSettings().offlineToastShown) return;
      updateSettings({ offlineToastShown: true });
      showToast({ text: 'Готово: приложение работает без интернета', icon: 'cloud-check' });
    },
  });

  // Новая версия включается сама (skipWaiting), но экран ещё старый — предлагаем перезагрузить.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
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
