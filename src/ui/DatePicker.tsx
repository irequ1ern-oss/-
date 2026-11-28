import { useEffect, useRef, useState } from 'preact/hooks';
import { addDays, isValidDate, moscowClock, startOfWeek } from '../core/time';
import { Icon } from './Icon';
import './date-picker.css';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const format = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('ru-RU', {
    ...options,
    timeZone: 'UTC',
  });
const months = Array.from({ length: 12 }, (_, i) =>
  format('2024-' + String(i + 1).padStart(2, '0') + '-01', { month: 'long' }),
);

export function calendarDays(month: string) {
  const start = startOfWeek(month.slice(0, 7) + '-01');
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
function shiftMonth(date: string, delta: number) {
  const first = date.slice(0, 7) + '-01';
  return delta < 0
    ? addDays(first, -1).slice(0, 7) + '-01'
    : addDays(first, 32).slice(0, 7) + '-01';
}

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  today?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
}
export function DatePicker({
  label,
  value,
  onChange,
  today = moscowClock().date,
  min = '1000-01-01',
  max = '9998-12-31',
  clearable,
}: Props) {
  const [open, setOpen] = useState(false);
  const [cursor, move] = useState(today);
  const [monthsOpen, switchView] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const limit = (day: string) =>
    min && day < min ? min : max && day > max ? max : day;
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function select(day: string) {
    if (day && limit(day) !== day) return;
    close();
    onChange(day);
  }
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current
        .querySelector<HTMLElement>('[data-cursor="true"]')
        ?.focus();
    }
  }, [open]);
  function step(days: number) {
    const next = limit(addDays(cursor, days));
    move(next);
    requestAnimationFrame(() =>
      dialog.current
        ?.querySelector<HTMLElement>('[data-cursor="true"]')
        ?.focus(),
    );
  }
  return (
    <>
      <button
        type="button"
        class="date-trigger"
        ref={trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          move(limit(isValidDate(value) ? value : today));
          switchView(false);
          setOpen(true);
        }}
      >
        <Icon name="calendar-dots" size={19} />
        <span>
          {value
            ? format(value, {
                day: 'numeric',
                month: 'short',
                ...(value.slice(0, 4) !== today.slice(0, 4)
                  ? { year: 'numeric' }
                  : {}),
              })
            : 'Выбрать дату'}
        </span>
        <Icon name="caret-down" size={12} />
      </button>
      {open && (
        <dialog
          ref={dialog}
          class="date-panel"
          aria-label={label}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const r = e.currentTarget.getBoundingClientRect();
              if (
                e.clientX < r.left ||
                e.clientX > r.right ||
                e.clientY < r.top ||
                e.clientY > r.bottom
              )
                close();
            }
          }}
        >
          <div class="date-heading">
            <small>{label}</small>
            <button
              type="button"
              aria-label="Закрыть календарь"
              onClick={close}
            >
              <Icon name="x" size={19} />
            </button>
          </div>
          <div class="date-month">
            <button
              type="button"
              aria-label="Месяц и год"
              aria-expanded={monthsOpen}
              onClick={() => switchView(!monthsOpen)}
            >
              {format(cursor, { month: 'long', year: 'numeric' }).replace(
                /\s*г\.$/,
                '',
              )}{' '}
              <Icon name="caret-down" size={14} />
            </button>
            {!monthsOpen &&
              [-1, 1].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={n < 0 ? 'Предыдущий месяц' : 'Следующий месяц'}
                  disabled={
                    n < 0
                      ? !!min && cursor.slice(0, 7) <= min.slice(0, 7)
                      : !!max && cursor.slice(0, 7) >= max.slice(0, 7)
                  }
                  onClick={() => move(limit(shiftMonth(cursor, n)))}
                >
                  <Icon name={n < 0 ? 'caret-left' : 'caret-right'} size={19} />
                </button>
              ))}
          </div>
          {monthsOpen ? (
            <div class="date-jump">
              <label>
                Год{' '}
                <input
                  type="number"
                  aria-label="Год календаря"
                  min="1000"
                  max="9998"
                  inputMode="numeric"
                  defaultValue={cursor.slice(0, 4)}
                  onInput={(e) => {
                    const y = e.currentTarget.value;
                    if (/^[1-9]\d{3}$/.test(y) && +y <= 9998)
                      move(y + cursor.slice(4, 7) + '-01');
                  }}
                />
              </label>
              <div>
                {months.map((m, i) => {
                  const month =
                    cursor.slice(0, 4) + '-' + String(i + 1).padStart(2, '0');
                  return (
                    <button
                      type="button"
                      key={m}
                      disabled={
                        (!!min && month < min.slice(0, 7)) ||
                        (!!max && month > max.slice(0, 7))
                      }
                      onClick={() => {
                        move(limit(month + '-01'));
                        switchView(false);
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div class="date-week" aria-hidden="true">
                {weekdays.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div class="date-days">
                {calendarDays(cursor).map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={format(day, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    data-date={day}
                    data-cursor={day === cursor}
                    data-outside={day.slice(0, 7) !== cursor.slice(0, 7)}
                    aria-pressed={day === value}
                    aria-current={day === today ? 'date' : undefined}
                    tabIndex={day === cursor ? 0 : -1}
                    disabled={limit(day) !== day}
                    onClick={() => select(day)}
                    onKeyDown={(e) => {
                      const n: Record<string, number> = {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      };
                      if (e.key in n) {
                        e.preventDefault();
                        step(n[e.key]);
                      }
                    }}
                  >
                    {Number(day.slice(-2))}
                  </button>
                ))}
              </div>
            </>
          )}
          <div class="date-shortcuts">
            {[
              [today, 'Сегодня'],
              [addDays(today, 1), 'Завтра'],
            ].map(([v, t]) => (
              <button
                type="button"
                key={v}
                disabled={v !== limit(v)}
                onClick={() => select(v)}
              >
                {t}
              </button>
            ))}
            {clearable && value && (
              <button type="button" onClick={() => select('')}>
                Очистить
              </button>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
