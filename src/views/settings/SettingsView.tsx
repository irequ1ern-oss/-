import type { BackInfo } from '../../shell/Stack';
import { Screen } from '../../ui/Screen';

// ЗАГОТОВКА: настройки и вложенные экраны (path: [], ['subjects'], ['subjects', id], ['schedule'], ['about']).
export function SettingsView({ path, back }: { path: string[]; back?: BackInfo }) {
  return (
    <Screen title={path.length ? path.join('/') : 'Настройки'} back={back}>
      <p class="t-secondary">Скоро</p>
    </Screen>
  );
}

/** Заголовок экрана настроек (для кнопки «‹ Назад» на вложенных экранах). */
export function settingsTitle(path: string[]): string {
  if (path.length === 0) return 'Настройки';
  return path[0];
}
