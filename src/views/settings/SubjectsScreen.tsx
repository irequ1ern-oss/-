// «Предметы»: список предметов и экран оформления одного предмета (цвет, иконка, сокращение, преподаватель).

import { COLOR_NAMES, SUBJECT_COLORS, type SubjectColor } from '../../core/colors';
import { updateSubjectPrefs, useSettings, type SubjectPrefs } from '../../state/settings';
import { subjectDefaults } from '../../state/subjects';
import { useAppData, useSubject } from '../../shell/app';
import { navigate } from '../../shell/nav';
import type { BackInfo } from '../../shell/Stack';
import { Cell, EmptyState, Group } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { TextField } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { SUBJECT_ICON_NAMES, type IconName } from '../../ui/iconData';
import { haptic } from '../../ui/haptics';
import { showToast } from '../../ui/overlays';
import { iconTitle } from './iconNames';

export function SubjectsScreen({ back }: { back?: BackInfo }) {
  const { main } = useAppData();
  return (
    <Screen title="Предметы" back={back}>
      <div class="settings">
        <Group footer="Цвета подобраны автоматически, чтобы предметы одного дня отличались. Нажми на предмет, чтобы поменять цвет, иконку или сокращение.">
          {main.subjects.map((s) => (
            <SubjectRow key={s.id} id={s.id} />
          ))}
        </Group>
      </div>
    </Screen>
  );
}

function SubjectRow({ id }: { id: string }) {
  const s = useSubject(id);
  return (
    <Cell
      class="subject-list-row"
      icon={<SubjectIcon color={s.color} icon={s.icon} />}
      title={s.short}
      subtitle={s.full !== s.short ? s.full : undefined}
      accessory="chevron"
      label={`${s.short}, ${s.full}`}
      onClick={() => navigate({ tab: 'settings', path: ['subjects', id] })}
    />
  );
}

/**
 * Клавиатура в группе вариантов (role=radiogroup) с «блуждающим» tabindex: в группу попадаешь одним Tab,
 * стрелки выбирают соседний вариант по кругу, Home/End — первый и последний, фокус идёт за выбором.
 * В сетке иконок ↑ ↓ работают так же, как ← → (предыдущий/следующий) — просто и предсказуемо.
 */
function radioKeys<T>(options: readonly T[], value: T, pick: (v: T) => void) {
  return (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+← — «Назад» в браузере
    const n = options.length;
    const i = Math.max(0, options.indexOf(value));
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j < 0) return;
    e.preventDefault();
    pick(options[j]);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus();
  };
}

/** Поля оформления (без преподавателя — его кнопка «Сбросить» не трогает). */
const LOOK_KEYS: (keyof SubjectPrefs)[] = ['color', 'icon', 'short'];

export function SubjectEditor({ id, back }: { id: string; back?: BackInfo }) {
  const { main } = useAppData();
  const settings = useSettings();
  const subject = useSubject(id);
  const known = main.subjects.some((s) => s.id === id);

  if (!known) {
    return (
      <Screen title="Предмет" back={back}>
        <EmptyState icon="book" title="Предмет не найден" text="Возможно, его убрали из основного расписания." />
      </Screen>
    );
  }

  const defaults = subjectDefaults(id, main);
  const prefs = settings.subjects[id] ?? {};
  const hasLook = LOOK_KEYS.some((k) => prefs[k] !== undefined);
  // Иконка из schedule.json может не входить в общий набор — тогда показываем её первой.
  const icons: IconName[] = SUBJECT_ICON_NAMES.includes(defaults.icon) ? SUBJECT_ICON_NAMES : [defaults.icon, ...SUBJECT_ICON_NAMES];
  // Вариант, на котором стоит Tab: выбранный (а если выбранной иконки нет в наборе — первый).
  const tabIcon = icons.includes(subject.icon) ? subject.icon : icons[0];

  const pickColor = (color: SubjectColor) => {
    if (color === subject.color) return;
    haptic();
    updateSubjectPrefs(id, { color: color === defaults.color ? undefined : color });
  };
  const pickIcon = (icon: IconName) => {
    if (icon === subject.icon) return;
    haptic();
    updateSubjectPrefs(id, { icon: icon === defaults.icon ? undefined : icon });
  };
  const reset = () => {
    updateSubjectPrefs(id, { color: undefined, icon: undefined, short: undefined });
    showToast({ text: 'Оформление сброшено', icon: 'arrows-clockwise' });
  };

  return (
    <Screen title={subject.short} back={back} class="screen--inline-title">
      <div class="settings">
        <div class="subject-preview" style={`--c:var(--sc-${subject.color})`}>
          <span key={`${subject.color}-${subject.icon}`} class="subject-preview__icon">
            <SubjectIcon color={subject.color} icon={subject.icon} size={64} />
          </span>
          <p class="t-title2 subject-preview__short">{subject.short}</p>
          {subject.full !== subject.short && <p class="t-subhead t-secondary subject-preview__full">{subject.full}</p>}
        </div>

        <Group header="Сокращение" footer={`Так предмет подписан в расписании. Оставь поле пустым, чтобы вернуть «${defaults.short.replace(/ /g, '\u00a0')}».`}>
          <Cell
            class="settings-field settings-field--wide"
            title={
              <TextField
                label="Сокращение"
                align="left"
                value={prefs.short ?? ''}
                placeholder={defaults.short}
                maxLength={16}
                onInput={(v) => updateSubjectPrefs(id, { short: v.trim() ? v : undefined })}
              />
            }
          />
        </Group>

        <Group header="Цвет">
          <div class="picker">
            <div class="swatches" role="radiogroup" aria-label="Цвет" onKeyDown={radioKeys(SUBJECT_COLORS, subject.color, pickColor)}>
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={c === subject.color}
                  tabIndex={c === subject.color ? 0 : -1}
                  aria-label={c === defaults.color ? `${COLOR_NAMES[c]} (автоматический)` : COLOR_NAMES[c]}
                  title={COLOR_NAMES[c]}
                  class={`swatch${c === subject.color ? ' is-selected' : ''}`}
                  style={`--c:var(--sc-${c})`}
                  onClick={() => pickColor(c)}
                >
                  <span class="swatch__dot">
                    <Icon name="check" size={18} class="swatch__check" />
                  </span>
                </button>
              ))}
            </div>
            <p class="swatches__auto t-footnote t-secondary">
              <span class="swatches__auto-dot" style={`--c:var(--sc-${defaults.color})`} aria-hidden="true" />
              Автоматический цвет: {COLOR_NAMES[defaults.color]}
            </p>
          </div>
        </Group>

        <Group header="Иконка">
          {/* Как в «Напоминаниях» iOS: варианты — серые плитки, цветом предмета — только выбранная */}
          <div class="icon-picks" role="radiogroup" aria-label="Иконка" onKeyDown={radioKeys(icons, subject.icon, pickIcon)}>
            {icons.map((name) => {
              const selected = name === subject.icon;
              return (
                <button
                  key={name}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={name === tabIcon ? 0 : -1}
                  aria-label={name === defaults.icon ? `${iconTitle(name)} (по умолчанию)` : iconTitle(name)}
                  title={iconTitle(name)}
                  class={`icon-pick${selected ? ' is-selected' : ''}`}
                  onClick={() => pickIcon(name)}
                >
                  {selected ? (
                    <SubjectIcon color={subject.color} icon={name} size={44} />
                  ) : (
                    <span class="icon-pick__tile" aria-hidden="true">
                      <Icon name={name} weight="fill" size={26} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Group>

        <Group header="Преподаватель">
          <Cell
            class="settings-field settings-field--wide"
            title={
              <TextField
                label="Преподаватель"
                align="left"
                value={subject.teacher ?? ''}
                placeholder="Не указан"
                maxLength={80}
                onInput={(teacher) => updateSubjectPrefs(id, { teacher })}
              />
            }
          />
        </Group>

        <Group footer={hasLook ? 'Вернёт цвет, иконку и сокращение по умолчанию. Преподаватель останется.' : undefined}>
          <Cell class="settings-danger" title="Сбросить оформление" disabled={!hasLook} onClick={reset} />
        </Group>
      </div>
    </Screen>
  );
}
