import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { formatDayLong } from '../../core/format';
import { goBack } from '../../shell/nav';
import { IconButton } from '../../ui/controls';

const leave = () => goBack({ tab: 'today', path: [] });

export function FocusTimer({ date, children }: { date: string; children: ComponentChildren }) {
  useEffect(() => {
    let disposed = false;
    let requesting = false;
    let lock: WakeLockSentinel | undefined;
    // На столе планшет остаётся включённым, пока виден именно крупный таймер.
    async function keepAwake() {
      if (requesting || document.visibilityState !== 'visible' || !navigator.wakeLock || (lock && !lock.released)) return;
      requesting = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (disposed) await acquired.release();
        else lock = acquired;
      } catch {
        // Энергосбережение и некоторые браузеры сами управляют экраном.
      } finally {
        requesting = false;
      }
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.sheet-layer, .ctx-layer')) leave();
    };
    void keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    window.addEventListener('keydown', escape);
    return () => {
      disposed = true;
      void lock?.release().catch(() => undefined);
      document.removeEventListener('visibilitychange', keepAwake);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <section class="focus-timer" aria-label="Крупный таймер">
      <header class="focus-timer__head">
        <span>{formatDayLong(date)}</span>
        <IconButton icon="x" label="Закрыть крупный таймер" variant="glass" onClick={leave} />
      </header>
      {children}
    </section>
  );
}
