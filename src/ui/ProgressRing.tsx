import type { ComponentChildren } from 'preact';
import './ProgressRing.css';

interface Props {
  size: number;
  stroke: number;
  /** 0…1 */
  progress: number;
  /** CSS-цвет, например var(--sc-blue). */
  color: string;
  children?: ComponentChildren;
  label?: string;
}

/** Кольцо прогресса. Значение меняется плавно (раз в секунду — без рывков). */
export function ProgressRing({ size, stroke, progress, color, children, label }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div
      class="ring"
      style={`--size:${size}px`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle class="ring__track" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} />
        <circle
          class="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke-width={stroke}
          style={`stroke:${color};stroke-dasharray:${c};stroke-dashoffset:${c * (1 - p)}`}
        />
      </svg>
      {children && <div class="ring__center">{children}</div>}
    </div>
  );
}
