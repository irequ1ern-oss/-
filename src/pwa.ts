// Установка как приложение и работа без интернета (service worker),
// плюс просьба к браузеру не удалять данные приложения.

import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';

interface PwaState {
  /** Вышла новая версия — можно обновиться. */
  needRefresh: boolean;
  /** Всё нужное скачано, приложение работает без интернета. */
  offlineReady: boolean;
}

let state: PwaState = { needRefresh: false, offlineReady: false };
const listeners = new Set<(s: PwaState) => void>();

function setState(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

export function setupPwa() {
  updateSW = registerSW({
    onNeedRefresh: () => setState({ needRefresh: true }),
    onOfflineReady: () => setState({ offlineReady: true }),
  });
  // Без этого браузер может стереть данные при нехватке места.
  navigator.storage?.persist?.().catch(() => undefined);
}

export function applyUpdate() {
  void updateSW?.(true);
}

export function dismissOfflineReady() {
  setState({ offlineReady: false });
}

export function usePwaState(): PwaState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

/** Защищены ли данные от автоматической очистки браузером. */
export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}
