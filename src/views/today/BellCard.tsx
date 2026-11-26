import type { ComponentChildren } from 'preact';
import { BELL_PAIRS } from '../../core/bells';
import { formatDuration } from '../../core/format';
import { toMinutes } from '../../core/time';
import { Icon } from '../../ui/Icon';
import { openSheet } from '../../ui/overlays';
import './bells.css';

export function openBells() {
  openSheet({ title: 'Расписание звонков', content: () => (
    <table class="bell-table tabular">
      <thead><tr><th>Пара</th><th>1-й урок</th><th>Перемена</th><th>2-й урок</th></tr></thead>
      <tbody>{BELL_PAIRS.map(p => (
        <tr key={p.number}>
          <th scope="row">{p.number}</th>
          <td>{p.start}–{p.pause}</td>
          <td>{formatDuration(toMinutes(p.resume) - toMinutes(p.pause))}</td>
          <td>{p.resume}–{p.end}</td>
        </tr>
      ))}</tbody>
    </table>
  ) });
}

interface Props {
  phase: string;
  label: string;
  value: string;
  progress?: number;
  detail?: string;
  footer?: ComponentChildren;
  class?: string;
}

export function BellCard({ phase, label, value, progress, detail, footer, class: cls = '' }: Props) {
  const sweep = Math.round(360 * Math.min(1, Math.max(0, progress ?? 0)));
  return (
    <section class={`bell-card ${cls}`} aria-label={phase}>
      <header class="bell-card__head">
        <span class="bell-card__phase">{phase}</span>
        <button class="bell-card__link pressable" onClick={openBells}><Icon name="bell" size={15} />Звонки</button>
      </header>
      <div class="bell-card__readout">
        <div class="bell-card__display">
          <p class="bell-card__label">{label}</p>
          <p class={`bell-card__value tabular${value.length > 6 ? ' is-long' : ''}`} role="timer" aria-live="off">{value}</p>
          {detail && <p class="bell-card__detail tabular">{detail}</p>}
        </div>
        <div class="bell-dial" style={`--sweep:${sweep}deg`} aria-hidden="true">
          <i class="bell-dial__arc" /><i class="bell-dial__marks" />
          <i class="bell-dial__hand" /><i class="bell-dial__hub" />
        </div>
      </div>
      {footer && <div class="bell-card__foot">{footer}</div>}
    </section>
  );
}
