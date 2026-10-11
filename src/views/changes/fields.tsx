// Поля и мелкие части редакторов изменений: дата и время (системный выбор, подпись по-русски),
// ошибки ввода, строки-действия, шторка подтверждения.

import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { isValidTime } from '../../core/time';
import { useClock } from '../../shell/clock';
import { Button } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/iconData';
import { Cell } from '../../ui/List';
import { dismissSheet, openSheet } from '../../ui/overlays';
import { fieldDate } from './changesText';
import './changes.css';

interface PickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Подпись для диктора: «Дата начала». */
  label: string;
  min?: string;
  max?: string;
}

/**
 * Системный выбор даты или времени под русской подписью-«таблеткой» (как компактный выбор даты в iOS).
 * Само поле прозрачное и лежит поверх подписи: нажатие открывает системный календарь или часы,
 * с клавиатуры его можно заполнять как обычно. Мышью календарь открываем сами (showPicker).
 */
function PickerField({ type, text, ...p }: PickerProps & { type: 'date' | 'time'; text: string }) {
  const input = useRef<HTMLInputElement>(null);
  const pointer = useRef('');
  const commit = (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    // Кнопка «Очистить» в системном календаре даёт пустое значение — оставляем прежнее.
    if (v && v !== p.value) p.onChange(v);
  };
  return (
    <span class={`picker-field picker-field--${type}`}>
      <span class={`picker-field__text${type === 'time' ? ' tabular' : ''}`} aria-hidden="true">
        {text}
      </span>
      <input
        ref={input}
        class="picker-field__input"
        type={type}
        value={p.value}
        min={p.min}
        max={p.max}
        step={type === 'time' ? 300 : undefined}
        aria-label={p.label}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onClick={() => {
          if (pointer.current !== 'mouse') return;
          try {
            input.current?.showPicker?.();
          } catch {
            // Браузер не умеет или выбор уже открыт — поле всё равно в фокусе.
          }
        }}
        onInput={commit}
        onChange={commit}
      />
    </span>
  );
}

/** Дата: «Чт, 15 октября» (другой год — с годом). */
export function DateField(props: PickerProps) {
  const { date } = useClock('minute');
  return <PickerField type="date" text={fieldDate(props.value, date)} {...props} />;
}

/** Время «09:00» (шаг 5 минут). */
export function TimeField(props: PickerProps) {
  return <PickerField type="time" text={isValidTime(props.value) ? props.value : '—'} {...props} />;
}

/** Ошибки ввода над формой. */
export function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div class="changes-errors" role="alert">
      <Icon name="info" size={20} weight="fill" class="changes-errors__icon" />
      <ul class="changes-errors__list t-subhead">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

interface ActionProps {
  icon: IconName;
  title: ComponentChildren;
  onClick: () => void;
  /** Красная строка (удалить, сбросить). */
  danger?: boolean;
  subtitle?: ComponentChildren;
  label?: string;
}

/** Строка-кнопка в списке: «Добавить пару», «Отметить все», «Удалить расписание». */
export function ActionCell({ icon, title, onClick, danger, subtitle, label }: ActionProps) {
  return (
    <Cell
      class={`changes-action${danger ? ' changes-action--danger' : ''}`}
      icon={
        <span class="changes-action__icon">
          <Icon name={icon} size={22} />
        </span>
      }
      title={title}
      subtitle={subtitle}
      label={label}
      onClick={onClick}
    />
  );
}

/**
 * Шторка-подтверждение опасного действия: true — подтвердили; «Отмена» или закрытая шторка — false.
 * Как подтверждение в SwipeRow, только для кнопок вне строк со свайпом.
 */
export function confirmAction(opts: { title: string; text?: string; confirmLabel: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (ok: boolean) => {
      if (answered) return;
      answered = true;
      resolve(ok);
    };
    const id = openSheet({
      title: opts.title,
      onClose: () => answer(false),
      content: () => (
        <div class="changes-confirm">
          {opts.text && <p class="changes-confirm__text t-subhead t-secondary">{opts.text}</p>}
          <Button
            block
            size="lg"
            class="changes-confirm__danger"
            onClick={() => {
              answer(true);
              dismissSheet(id);
            }}
          >
            {opts.confirmLabel}
          </Button>
          <Button
            block
            size="lg"
            variant="gray"
            onClick={() => {
              answer(false);
              dismissSheet(id);
            }}
          >
            Отмена
          </Button>
        </div>
      ),
    });
  });
}
