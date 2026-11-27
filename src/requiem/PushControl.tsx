import { useEffect, useState } from 'preact/hooks';
import { api } from './client';
async function worker() {
  await navigator.serviceWorker.register('/account/worker.js', {
    scope: '/account/',
  });
  return navigator.serviceWorker.ready;
}
export function PushControl() {
  const [key, set] = useState<string | null>(null),
    [active, check] = useState(false),
    [msg, say] = useState('');
  useEffect(() => {
    api<{ public_key: string | null }>('push/config')
      .then((c) => set(c.public_key))
      .catch((e) => say(e.message));
    if ('serviceWorker' in navigator)
      navigator.serviceWorker
        .getRegistration('/account/')
        .then((r) => r?.pushManager?.getSubscription())
        .then((s) => check(!!s))
        .catch(() => {});
  }, []);
  async function flip() {
    try {
      const reg = await worker();
      if (active) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api('push/unsubscribe', { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        check(false);
        return;
      }
      if ((await Notification.requestPermission()) !== 'granted')
        throw Error('Браузер не разрешил уведомления');
      const s = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key!,
      });
      try {
        await api('push/subscribe', {
          endpoint: s.endpoint,
          keys: s.toJSON().keys,
        });
      } catch (e) {
        await s.unsubscribe();
        throw e;
      }
      check(true);
    } catch (e) {
      say((e as Error).message);
    }
  }
  return (
    <section class="rq-card">
      <h2>Уведомления на устройстве</h2>
      {key && 'PushManager' in window ? (
        <button onClick={flip}>
          {active ? 'Отключить Web Push' : 'Включить Web Push'}
        </button>
      ) : (
        <p>
          {key
            ? 'Браузер не поддерживает Web Push'
            : 'Для доставки при закрытом приложении нужны серверные ключи Web Push.'}
        </p>
      )}
      {msg && <p>{msg}</p>}
    </section>
  );
}
