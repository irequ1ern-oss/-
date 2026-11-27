import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon';
import { Sheet } from './Sheet';
import type { Desk } from './client';

interface Option {
  id: string;
  label: string;
}
export const contexts: Option[] = [
  { id: 'auto', label: 'Автоматически' },
  { id: 'Dawn', label: 'Утро' },
  { id: 'Execution', label: 'В колледже' },
  { id: 'Departure', label: 'Дорога домой' },
  { id: 'Nocturne', label: 'Вечер' },
];
const names: Record<string, string> = {
  Balance: 'Баланс',
  Freedom: 'Свободное время',
  Session: 'Подготовка к сессии',
  Recovery: 'Восстановление',
  Conservative: 'Минимум риска',
};
export function strategies(d: Desk): Option[] {
  return [
    ...d.strategies.map((id) => ({ id, label: names[id] ?? id })),
    ...d.records
      .filter((r) => r.kind === 'strategy')
      .map((r) => ({ id: r.id, label: String(r.data.title) })),
  ];
}
export function Choice({
  title,
  value,
  options,
  change,
}: {
  title: string;
  value: string;
  options: Option[];
  change: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        class="rq-choice"
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {options.find((o) => o.id === value)?.label ?? value}
        <Icon name="caret-down" size={14} />
      </button>
      {open && (
        <Sheet title={title} close={() => setOpen(false)}>
          <div class="rq-choice-options">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={value === o.id}
                onClick={() => {
                  setOpen(false);
                  if (value !== o.id) change(o.id);
                }}
              >
                {o.label}
                {value === o.id && <Icon name="check" size={19} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
