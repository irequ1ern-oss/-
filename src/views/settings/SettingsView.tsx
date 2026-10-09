// Настройки (вместо старого «Ещё») и вложенные экраны:
// [] — главный, ['subjects'], ['subjects', id], ['schedule'], ['about'].

import { mainSchedule } from '../../data/schedule';
import { getSettings, updateSettings, useSettings, type ThemeChoice } from '../../state/settings';
import { subjectView } from '../../state/subjects';
import { useAppData } from '../../shell/app';
import { navigate } from '../../shell/nav';
import type { BackInfo } from '../../shell/Stack';
import { Cell, Group, IconTile } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Segmented, Switch, TextField } from '../../ui/controls';
import { AboutScreen } from './AboutScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SubjectEditor, SubjectsScreen } from './SubjectsScreen';
import { subgroupRoomsNote, subjectsWithSubgroupRooms } from './settingsText';
import './settings.css';

interface Props {
  path: string[];
  back?: BackInfo;
}

export function SettingsView({ path, back }: Props) {
  const [section, id] = path;
  if (section === 'subjects') return id ? <SubjectEditor id={id} back={back} /> : <SubjectsScreen back={back} />;
  if (section === 'schedule') return <ScheduleScreen back={back} />;
  if (section === 'about') return <AboutScreen back={back} />;
  return <SettingsRoot back={back} />;
}

/** Заголовок экрана настроек (для кнопки «‹ Назад» на вложенных экранах). */
export function settingsTitle(path: string[]): string {
  const [section, id] = path;
  if (section === 'subjects') return id ? subjectView(id, mainSchedule, getSettings()).short : 'Предметы';
  if (section === 'schedule') return 'Основное расписание';
  if (section === 'about') return 'О приложении';
  return 'Настройки';
}

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'amoled', label: 'AMOLED' },
];

const SUBGROUP_OPTIONS: { value: 1 | 2; label: string }[] = [
  { value: 1, label: '1-я' },
  { value: 2, label: '2-я' },
];

const go = (path: string[]) => navigate({ tab: 'settings', path });

function SettingsRoot({ back }: { back?: BackInfo }) {
  const settings = useSettings();
  const { main } = useAppData();
  const roomsNote = subgroupRoomsNote(subjectsWithSubgroupRooms(main).map((id) => subjectView(id, main, settings).short));

  return (
    <Screen title="Настройки" back={back}>
      <div class="settings">
        <Group header="Профиль" footer="Используется в приветствии на экране «Сегодня».">
          <Cell
            class="settings-field"
            icon={<IconTile name="user" color="blue" />}
            title="Имя"
            accessory={
              <TextField
                label="Имя"
                value={settings.name}
                placeholder="Имя для приветствия"
                maxLength={40}
                onInput={(name) => updateSettings({ name })}
              />
            }
          />
        </Group>

        <Group header="Оформление" footer="AMOLED — чисто чёрный фон, бережёт батарею на OLED-экране.">
          <Cell
            class="settings-segment"
            icon={<IconTile name="palette" color="indigo" />}
            title="Тема"
            below={<Segmented label="Тема" options={THEME_OPTIONS} value={settings.theme} onChange={(theme) => updateSettings({ theme })} />}
          />
        </Group>

        <Group header="Учёба" footer={roomsNote}>
          <Cell
            class="settings-segment"
            icon={<IconTile name="users-three" color="teal" />}
            title="Подгруппа"
            below={
              <Segmented label="Подгруппа" options={SUBGROUP_OPTIONS} value={settings.subgroup} onChange={(subgroup) => updateSettings({ subgroup })} />
            }
          />
          <Cell
            icon={<IconTile name="book-open" color="orange" />}
            title="Предметы"
            value={<span class="tabular">{main.subjects.length}</span>}
            accessory="chevron"
            onClick={() => go(['subjects'])}
          />
          <Cell
            icon={<IconTile name="calendar" color="green" />}
            title="Основное расписание"
            accessory="chevron"
            onClick={() => go(['schedule'])}
          />
        </Group>

        <Group
          header="Отклик"
          footer="Короткая вибрация при переключателях, отметке ДЗ и долгом нажатии. На iPhone и большинстве компьютеров не работает."
        >
          <Cell
            icon={<IconTile name="vibrate" color="purple" />}
            title="Тактильный отклик"
            accessory={<Switch label="Тактильный отклик" checked={settings.haptics} onChange={(haptics) => updateSettings({ haptics })} />}
          />
        </Group>

        <Group>
          <Cell icon={<IconTile name="info" color="gray" />} title="О приложении" accessory="chevron" onClick={() => go(['about'])} />
        </Group>
      </div>
    </Screen>
  );
}
