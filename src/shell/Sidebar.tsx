// Боковое меню планшета (как на iPad). Сворачивается в узкую полосу с иконками.

import { useState } from 'preact/hooks';
import { updateSettings, useSettings } from '../state/settings';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/controls';
import type { IconName } from '../ui/iconData';
import { navigate, type TabId } from './nav';
import { TABS } from './TabBar';

const ITEMS: { id: TabId; label: string; icon: IconName }[] = [...TABS, { id: 'settings', label: 'Настройки', icon: 'gear-six' }];

export function Sidebar({ active, homeworkCount, onPlus }: { active: TabId; homeworkCount: number; onPlus: () => void }) {
  const { sidebarCollapsed: collapsed } = useSettings();
  // Подписи проявляются только после нажатия, а не при каждом открытии приложения.
  const [toggled, setToggled] = useState(false);
  return (
    <nav class={`sidebar${toggled ? ' is-animated' : ''}`} aria-label="Разделы">
      <div class="sidebar__bg sidebar__bg--wide glass" aria-hidden="true" />
      <div class="sidebar__bg sidebar__bg--rail glass" aria-hidden="true" />
      <div class="sidebar__head">
        <IconButton
          icon="sidebar-simple"
          label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          variant="plain"
          size={40}
          onClick={() => {
            setToggled(true);
            updateSettings({ sidebarCollapsed: !collapsed });
          }}
        />
        {!collapsed && <span class="sidebar__title t-title3">Учёба</span>}
        <IconButton icon="plus" label="Создать" variant="accent" size={40} onClick={onPlus} />
      </div>
      <ul class="sidebar__list">
        {ITEMS.map((it, i) => {
          const isActive = it.id === active;
          // Свёрнутое меню: подписи нет, поэтому название (и число невыполненных ДЗ) — в aria-label.
          const collapsedLabel = it.id === 'homework' && homeworkCount > 0 ? `${it.label}, невыполненных: ${homeworkCount}` : it.label;
          return (
            <li key={it.id} class={it.id === 'settings' ? 'sidebar__item--bottom' : undefined} style={i === 0 ? undefined : undefined}>
              <button
                class={`sidebar__item${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? it.label : undefined}
                aria-label={collapsed ? collapsedLabel : undefined}
                onClick={() => navigate({ tab: it.id, path: [] })}
              >
                <span class="sidebar__icon">
                  <Icon name={it.icon} weight={isActive ? 'fill' : 'regular'} size={24} />
                  {collapsed && it.id === 'homework' && (
                    <span class="sidebar__dot">
                      <Badge count={homeworkCount} />
                    </span>
                  )}
                </span>
                {!collapsed && <span class="sidebar__label">{it.label}</span>}
                {!collapsed && it.id === 'homework' && <Badge count={homeworkCount} label={`Невыполненных ДЗ: ${homeworkCount}`} />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
