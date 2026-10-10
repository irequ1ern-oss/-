// Сгруппированные списки как в «Настройках» iOS: скруглённый блок, разделители с отступом слева.

import type { ComponentChildren, JSX } from 'preact';
import { Icon } from './Icon';
import './List.css';

interface GroupProps {
  header?: ComponentChildren;
  footer?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
}

export function Group({ header, footer, children, class: cls }: GroupProps) {
  return (
    <section class={cls ? `group ${cls}` : 'group'}>
      {header && <h3 class="group__header t-footnote t-upper">{header}</h3>}
      <div class="group__body">{children}</div>
      {footer && <p class="group__footer t-footnote">{footer}</p>}
    </section>
  );
}

type CellProps = {
  /** Иконка слева (SubjectIcon или IconTile). */
  icon?: ComponentChildren;
  title: ComponentChildren;
  subtitle?: ComponentChildren;
  /** Значение справа серым текстом. */
  value?: ComponentChildren;
  /** «chevron» — стрелка перехода; или любой элемент (переключатель, значок). */
  accessory?: 'chevron' | ComponentChildren;
  /** Под строкой: например, сегментированный переключатель на всю ширину. */
  below?: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  /** Подсветка строки (например, текущая пара). */
  highlight?: boolean;
  dimmed?: boolean;
  class?: string;
  style?: string;
  label?: string;
} & Omit<JSX.HTMLAttributes<HTMLElement>, 'title' | 'icon' | 'onClick' | 'class' | 'style'>;

/** Поле ввода в строке без своего действия (см. TextField). */
const fieldIn = (row: EventTarget | null) => (row as HTMLElement | null)?.querySelector<HTMLInputElement>('input, textarea') ?? null;
const isControl = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('input, textarea, select, button, a');

/** Нажатие на подпись строки с полем ставит курсор в поле — как в «Настройках» iOS. */
function focusField(e: MouseEvent) {
  const field = fieldIn(e.currentTarget);
  if (!field || field.disabled || isControl(e.target)) return;
  if (document.activeElement === field) return;
  field.focus();
  const end = field.value.length;
  field.setSelectionRange?.(end, end);
}

/** Не даём полю потерять фокус, если нажали на подпись, пока оно уже в фокусе (клавиатура не мигает). */
function keepFieldFocus(e: MouseEvent) {
  const field = fieldIn(e.currentTarget);
  if (field && document.activeElement === field && !isControl(e.target)) e.preventDefault();
}

export function Cell(props: CellProps) {
  const { icon, title, subtitle, value, accessory, below, onClick, disabled, highlight, dimmed, class: cls, style, label, ...rest } = props;
  const classes = ['cell'];
  if (onClick && !disabled) classes.push('cell--interactive');
  if (disabled) classes.push('cell--disabled');
  if (highlight) classes.push('cell--highlight');
  if (dimmed) classes.push('cell--dimmed');
  if (cls) classes.push(cls);
  const inner = (
    <>
      {icon && <span class="cell__icon">{icon}</span>}
      <span class="cell__content">
        <span class="cell__text">
          <span class="cell__title">{title}</span>
          {subtitle && <span class="cell__subtitle t-subhead">{subtitle}</span>}
        </span>
        {value !== undefined && value !== null && <span class="cell__value">{value}</span>}
        {accessory === 'chevron' ? (
          <Icon name="caret-right" size={16} class="cell__chevron" />
        ) : (
          accessory && <span class="cell__accessory">{accessory}</span>
        )}
      </span>
    </>
  );
  return (
    <div class={classes.join(' ')} style={style}>
      {onClick ? (
        <button class="cell__row" onClick={disabled ? undefined : onClick} disabled={disabled} aria-label={label} {...(rest as JSX.HTMLAttributes<HTMLButtonElement>)}>
          {inner}
        </button>
      ) : (
        <div class="cell__row" aria-label={label} onClick={focusField} onMouseDown={keepFieldFocus} {...(rest as JSX.HTMLAttributes<HTMLDivElement>)}>
          {inner}
        </div>
      )}
      {below && <div class="cell__below">{below}</div>}
    </div>
  );
}

/** Цветная плашка с белым значком для строк настроек (как в «Настройках» iOS). */
export function IconTile({ name, color }: { name: Parameters<typeof Icon>[0]['name']; color: string }) {
  // --ct — более глубокий фон плитки для самых светлых цветов (жёлтый, мятный…), если он задан в токенах.
  return (
    <span class="icon-tile" style={`--c:var(--sc-${color});--ct:var(--sc-${color}-tile, var(--sc-${color}))`} aria-hidden="true">
      <Icon name={name} weight="fill" size={18} />
    </span>
  );
}

interface EmptyStateProps {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  text?: string;
  /** Без карточки, прямо на фоне экрана — когда заглушка единственное содержимое (как ContentUnavailableView). */
  plain?: boolean;
  class?: string;
  children?: ComponentChildren;
}

/** Заглушка «пока пусто» в стиле iOS. */
export function EmptyState({ icon, title, text, plain, class: cls, children }: EmptyStateProps) {
  const classes = ['empty-state'];
  if (plain) classes.push('empty-state--plain');
  if (cls) classes.push(cls);
  return (
    <div class={classes.join(' ')}>
      <span class="empty-state__icon">
        <Icon name={icon} size={34} />
      </span>
      <p class="t-headline">{title}</p>
      {text && <p class="t-subhead t-secondary">{text}</p>}
      {children}
    </div>
  );
}
