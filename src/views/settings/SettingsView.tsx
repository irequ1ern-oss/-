// Настройки (вместо старого «Ещё») и вложенные экраны:
// [] — главный, ['subjects'], ['subjects', id], ['schedule'], ['about'],
// ['changes'] и экраны изменений расписания: ['changes', 'day-2026-10-15'], ['changes', 'period-<id>'], ['changes', 'new-practice'].

import { mainSchedule } from '../../data/schedule';
import { getChanges } from '../../state/changes';
import { getSettings, updateSettings, useSettings, type ThemeChoice } from '../../state/settings';
import { subjectView, withUserSubjects } from '../../state/subjects';
import { useAppData } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { navigate } from '../../shell/nav';
import type { BackInfo } from '../../shell/Stack';
import { Cell, Group, IconTile } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Segmented, Switch, TextField } from '../../ui/controls';
import { ChangesScreen } from '../changes/ChangesScreen';
import { activeChangesCount, dayTitleShort, NEW_PERIOD_TITLES, parseChangesPath } from '../changes/changesText';
import { DayEditorScreen } from '../changes/DayEditor';
import { PeriodEditorScreen } from '../changes/PeriodEditor';
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
  if (section === 'changes') return <ChangesRoute id={id} back={back} />;
  return <SettingsRoot back={back} />;
}

function ChangesRoute({ id, back }: { id?: string; back?: BackInfo }) {
  const route = parseChangesPath(id) ?? { screen: 'list' };
  switch (route.screen) {
    case 'day':
      return <DayEditorScreen date={route.date} back={back} />;
    case 'period':
      return <PeriodEditorScreen key={route.id} id={route.id} back={back} />;
    case 'new':
      return <PeriodEditorScreen key={`new-${route.kind}`} kind={route.kind} back={back} />;
    default:
      return <ChangesScreen back={back} />;
  }
}

/** Заголовок экрана изменений расписания (для «‹ Назад»). */
function changesTitle(id: string | undefined): string {
  const route = parseChangesPath(id);
  if (!route || route.screen === 'list') return 'Изменения расписания';
  if (route.screen === 'day') return dayTitleShort(route.date);
  if (route.screen === 'new') return NEW_PERIOD_TITLES[route.kind];
  return getChanges().periods.find((p) => p.id === route.id)?.title ?? 'Расписание';
}

/** Заголовок экрана настроек (для кнопки «‹ Назад» на вложенных экранах). */
export function settingsTitle(path: string[]): string {
  const [section, id] = path;
  if (section === 'subjects') {
    // Свои предметы («Практика») тоже в списке — их названия берём из хранилища изменений.
    return id ? subjectView(id, withUserSubjects(mainSchedule, getChanges().subjects), getSettings()).short : 'Предметы';
  }
  if (section === 'schedule') return 'Основное расписание';
  if (section === 'about') return 'О приложении';
  if (section === 'changes') return changesTitle(id);
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
  const { main, src } = useAppData();
  const { date: today } = useClock('minute');
  const changes = activeChangesCount(src, today);
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
            icon={<IconTile name="book-open" color="brown" />}
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
          <Cell
            icon={<IconTile name="swap" color="orange" />}
            title="Изменения расписания"
            value={changes > 0 ? <span class="tabular">{changes}</span> : undefined}
            accessory="chevron"
            label={changes > 0 ? `Изменения расписания: ${changes}` : undefined}
            onClick={() => go(['changes'])}
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
