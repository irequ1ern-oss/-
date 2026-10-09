// «О приложении»: версия, дата сборки, работа без интернета, защита данных, ссылка на исходный код.

import { useEffect, useState } from 'preact/hooks';
import { moscowClock } from '../../core/time';
import { useAppData } from '../../shell/app';
import type { BackInfo } from '../../shell/Stack';
import { Cell, Group, IconTile } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Icon } from '../../ui/Icon';
import { formatBuildTime, offlineLabel, persistedLabel } from './settingsText';

const SOURCE_URL = 'https://github.com/irequ1ern-oss/-';

/** Есть ли service worker, который уже управляет страницей (то есть приложение откроется без сети). */
function useOfflineState(): { supported: boolean; controlled: boolean } {
  const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
  const [controlled, setControlled] = useState(Boolean(sw?.controller));
  useEffect(() => {
    if (!sw) return;
    const update = () => setControlled(Boolean(sw.controller));
    sw.addEventListener('controllerchange', update);
    return () => sw.removeEventListener('controllerchange', update);
  }, [sw]);
  return { supported: Boolean(sw), controlled };
}

/** Защищены ли данные от автоматической очистки браузером: undefined — ещё проверяем, null — неизвестно. */
function usePersisted(): boolean | null | undefined {
  const [value, setValue] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const check = navigator.storage?.persisted?.bind(navigator.storage);
    if (!check) {
      setValue(null);
      return;
    }
    check()
      .then((v) => alive && setValue(v))
      .catch(() => alive && setValue(null));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

/** Строка состояния: подпись под названием, зелёная галочка — когда всё хорошо. */
function StatusCell({ title, text, ok }: { title: string; text: string; ok: boolean }) {
  return (
    <Cell
      title={title}
      subtitle={text}
      accessory={ok ? <Icon name="check-circle" weight="fill" size={22} class="about-ok" /> : undefined}
    />
  );
}

export function AboutScreen({ back }: { back?: BackInfo }) {
  const { demo } = useAppData();
  const offline = useOfflineState();
  const persisted = usePersisted();
  const icon = `${import.meta.env.BASE_URL}icons/icon-192.png`;

  return (
    <Screen title="О приложении" back={back}>
      <div class="settings">
        <div class="about-head">
          <img class="about-head__icon" src={icon} width={64} height={64} alt="" />
          <p class="t-title2">Учёба</p>
          <p class="t-subhead t-secondary">Расписание пар, ДЗ и заметки</p>
        </div>

        <Group>
          <Cell title="Версия" value={<span class="tabular">{__APP_VERSION__}</span>} />
          <Cell title="Обновлено" value={<span class="tabular">{formatBuildTime(__BUILD_TIME__, moscowClock().date.slice(0, 4))}</span>} />
          <Cell title="Часовой пояс" value="Москва" />
        </Group>

        <Group footer="Защита от очистки обычно включается после установки приложения на главный экран.">
          {/* Превью не попадает в офлайн-кеш (см. vite.config.ts), поэтому там честно пишем, что не работает */}
          <StatusCell
            title="Работа без интернета"
            text={demo ? 'В превью не работает' : offlineLabel(offline.supported, offline.controlled)}
            ok={!demo && offline.controlled}
          />
          <StatusCell title="Данные защищены от очистки" text={persistedLabel(persisted)} ok={persisted === true} />
        </Group>

        <Group>
          <div class="cell cell--interactive">
            <a class="cell__row about-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              <span class="cell__icon">
                <IconTile name="code" color="gray" />
              </span>
              <span class="cell__content">
                <span class="cell__text">
                  <span class="cell__title">Исходный код</span>
                </span>
                <span class="cell__value">GitHub</span>
                <Icon name="arrow-square-out" size={18} class="cell__chevron" />
              </span>
            </a>
          </div>
        </Group>

        {demo && <p class="settings-note t-footnote">Это превью дизайна: настройки здесь хранятся отдельно от настоящего приложения.</p>}
      </div>
    </Screen>
  );
}
