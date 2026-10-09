import './Badge.css';

/** Красный кружок с числом (например, невыполненные ДЗ). Ноль не показывается. */
export function Badge({ count, label }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <span class="badge tabular" aria-label={label ?? `${count}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
