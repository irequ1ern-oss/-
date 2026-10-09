// Нижнее меню телефона: стеклянная капсула с 4 вкладками и отдельная круглая кнопка «+».

import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/iconData';
import { haptic } from '../ui/haptics';
import { navigate, type TabId } from './nav';

export const TABS: { id: Exclude<TabId, 'settings'>; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Сегодня', icon: 'clock' },
  { id: 'week', label: 'Неделя', icon: 'calendar' },
  { id: 'homework', label: 'ДЗ', icon: 'check-square' },
  { id: 'notes', label: 'Заметки', icon: 'notepad' },
];

interface Props {
  active: TabId;
  homeworkCount: number;
  onPlus: () => void;
}

export function TabBar({ active, homeworkCount, onPlus }: Props) {
  const activeTab = active === 'settings' ? 'today' : active;
  const index = TABS.findIndex((t) => t.id === activeTab);
  return (
    <nav class="tabbar" aria-label="Разделы">
      <div class="tabbar__capsule glass" style={`--i:${index}`}>
        <span class="tabbar__indicator" aria-hidden="true" />
        {TABS.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              class={`tabbar__item${isActive ? ' is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (!isActive || active === 'settings') haptic();
                navigate({ tab: t.id, path: [] });
              }}
            >
              <span class="tabbar__icon">
                <Icon name={t.icon} weight={isActive ? 'fill' : 'regular'} size={26} />
                {t.id === 'homework' && (
                  <span class="tabbar__badge">
                    <Badge count={homeworkCount} label={`Невыполненных ДЗ: ${homeworkCount}`} />
                  </span>
                )}
              </span>
              <span class="tabbar__label">{t.label}</span>
            </button>
          );
        })}
      </div>
      <button class="tabbar__plus pressable" aria-label="Создать: ДЗ, заметку или изменение расписания" onClick={onPlus}>
        <Icon name="plus" size={28} weight="regular" />
      </button>
    </nav>
  );
}
