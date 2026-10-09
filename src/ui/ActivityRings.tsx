// Кольца статистики как в «Активности» Apple: вложенные кольца, каждое — доля от 0 до 1.
// Больше 1 — кольцо замкнуто и идёт второй круг (конец круга отмечен тенью, как в iOS).
// При появлении кольца плавно заполняются; при «уменьшении движения» — сразу (токены длительности).

import { useEffect, useState } from 'preact/hooks';
import './ActivityRings.css';

export interface Ring {
  /** 0…1; больше 1 — второй круг. */
  value: number;
  /** CSS-цвет, например var(--accent). */
  color: string;
  label: string;
  /** Подпись значения для диктора: «5 из 7». Без неё — проценты. */
  caption?: string;
}

interface Props {
  rings: Ring[];
  size?: number;
  stroke?: number;
}

/** Промежуток между кольцами. */
const GAP = 3;

/** Радиусы колец снаружи внутрь (по средней линии). */
export function ringRadii(size: number, stroke: number, count: number): number[] {
  const outer = (size - stroke) / 2;
  return Array.from({ length: count }, (_, i) => outer - i * (stroke + GAP));
}

/**
 * Как нарисовать значение: сколько закрашено на текущем круге (0…1) и замкнут ли круг под ним.
 * 1 — ровно один полный круг, 1.25 — полный и ещё четверть.
 */
export function ringArc(value: number): { fraction: number; lapped: boolean } {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (v <= 1) return { fraction: v, lapped: false };
  const rest = v % 1;
  return { fraction: rest === 0 ? 1 : rest, lapped: true };
}

/** Текст для диктора: «Сделано: 5 из 7; Вовремя: 4 из 7». */
export function ringsLabel(rings: Ring[]): string {
  return rings.map((r) => `${r.label}: ${r.caption ?? `${Math.round(Math.max(0, r.value) * 100)}%`}`).join('; ');
}

export function ActivityRings({ rings, size = 120, stroke = 14 }: Props) {
  // Сначала пустые — после первого кадра заполняются с анимацией.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const radii = ringRadii(size, stroke, rings.length);
  const c = size / 2;

  return (
    <div class="activity-rings" style={`--size:${size}px`} role="img" aria-label={ringsLabel(rings)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {rings.map((ring, i) => {
          const r = radii[i];
          if (r <= stroke / 2) return null;
          const len = 2 * Math.PI * r;
          const { fraction, lapped } = ringArc(ring.value);
          const f = shown ? fraction : 0;
          // Конец дуги: угол от верхней точки по часовой стрелке (svg повёрнут на −90°).
          const angle = 2 * Math.PI * f;
          return (
            <g key={i} style={`--ring:${ring.color}`}>
              <circle class="activity-rings__track" cx={c} cy={c} r={r} stroke-width={stroke} />
              {lapped && shown && <circle class="activity-rings__base" cx={c} cy={c} r={r} stroke-width={stroke} />}
              <circle
                class="activity-rings__value"
                cx={c}
                cy={c}
                r={r}
                stroke-width={stroke}
                style={`stroke-dasharray:${len};stroke-dashoffset:${len * (1 - f)};opacity:${fraction > 0 ? 1 : 0}`}
              />
              {lapped && shown && (
                <circle class="activity-rings__cap" cx={c + r * Math.cos(angle)} cy={c + r * Math.sin(angle)} r={stroke / 2} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
