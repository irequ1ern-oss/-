// Элементы управления в стиле iOS: сегментированный переключатель, тумблер, кнопки, поле ввода.

import type { ComponentChildren, JSX } from 'preact';
import { haptic } from './haptics';
import { Icon } from './Icon';
import type { IconName } from './iconData';
import './controls.css';

interface SegmentedProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/**
 * Сегментированный переключатель: выбранный сегмент — светлая «таблетка», плавно переезжает.
 * С клавиатуры — как группа радиокнопок: Tab попадает только на выбранный сегмент, стрелки и Home/End выбирают.
 */
export function Segmented<T extends string | number>({ options, value, onChange, label }: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const pick = (o: { value: T }) => {
    if (o.value !== value) {
      haptic();
      onChange(o.value);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const last = items.length - 1;
    const from = items.indexOf(e.target as HTMLButtonElement);
    const at = from < 0 ? index : from;
    let next: number;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        next = at > 0 ? at - 1 : last;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        next = at < last ? at + 1 : 0;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    items[next]?.focus();
    if (options[next]) pick(options[next]);
  };
  return (
    <div class="segmented" role="radiogroup" aria-label={label} style={`--n:${options.length};--i:${index}`} onKeyDown={onKeyDown}>
      <span class="segmented__thumb" aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === index ? 0 : -1}
          class={`segmented__item${o.value === value ? ' is-active' : ''}`}
          onClick={() => pick(o)}
        >
          <span class="segmented__label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Тумблер iOS. Включённый — цвета акцента. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      class={`switch${checked ? ' is-on' : ''}`}
      onClick={() => {
        haptic();
        onChange(!checked);
      }}
    >
      <span class="switch__knob" />
    </button>
  );
}

type ButtonProps = {
  variant?: 'filled' | 'tinted' | 'plain' | 'gray';
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  children?: ComponentChildren;
  block?: boolean;
} & JSX.HTMLAttributes<HTMLButtonElement>;

export function Button({ variant = 'filled', size = 'md', icon, children, block, class: cls, ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, 'pressable'];
  if (block) classes.push('btn--block');
  if (cls) classes.push(String(cls));
  return (
    <button class={classes.join(' ')} {...rest}>
      {icon && <Icon name={icon} weight="fill" size={size === 'sm' ? 16 : 20} />}
      {children && <span>{children}</span>}
    </button>
  );
}

type IconButtonProps = {
  icon: IconName;
  label: string;
  variant?: 'glass' | 'gray' | 'accent' | 'plain';
  size?: number;
  weight?: 'regular' | 'fill';
} & Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'icon' | 'size'>;

/** Круглая кнопка-иконка (обязательно с подписью label для экранного диктора). */
export function IconButton({ icon, label, variant = 'gray', size = 44, weight = 'regular', class: cls, ...rest }: IconButtonProps) {
  return (
    <button
      class={`icon-btn icon-btn--${variant} pressable${variant === 'glass' ? ' glass' : ''}${cls ? ` ${cls}` : ''}`}
      style={`--size:${size}px`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} weight={weight} size={Math.round(size * 0.48)} />
    </button>
  );
}

type TextFieldProps = {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  label: string;
  align?: 'left' | 'right';
  maxLength?: number;
};

/** Поле ввода внутри строки списка (как в «Настройках»). */
export function TextField({ value, onInput, placeholder, label, align = 'right', maxLength }: TextFieldProps) {
  return (
    <input
      class={`text-field text-field--${align}`}
      type="text"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      maxLength={maxLength}
      autoComplete="off"
      enterKeyHint="done"
      onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
