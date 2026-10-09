// Тактильный отклик: короткая вибрация. Отключается в настройках.
// На устройствах без поддержки (iPhone, большинство ПК) просто ничего не происходит.

import { getSettings } from '../state/settings';

export function haptic(kind: 'light' | 'medium' = 'light') {
  if (!getSettings().haptics) return;
  try {
    navigator.vibrate?.(kind === 'light' ? 10 : 18);
  } catch {
    // vibrate может быть запрещён политикой страницы — это не ошибка.
  }
}
