import { weekdayKey, toMinutes } from '../core/time';
import { formatDDMM, formatTimer } from '../core/format';
import { useClock } from '../shell/clock';
import { useSettings, updateSettings } from '../state/settings';
import { Cell } from '../ui/List';
import { Switch } from '../ui/controls';
import { ProgressRing } from '../ui/ProgressRing';

const TITLE = 'Разговоры о важном';
const START = '08:30';
const END = '09:00';
const startSecond = toMinutes(START) * 60;
export const talkEndSecond = toMinutes(END) * 60;

export function MondayTalk({ date }: { date: string }) {
  const { talkDates } = useSettings();
  if (weekdayKey(date) !== 'mon') return null;
  const enabled = talkDates.includes(date);
  return (
    <Cell title={TITLE} subtitle={enabled ? `${START}–${END} · ${formatDDMM(date)}` : `Включить на ${formatDDMM(date)}`}
      accessory={<Switch checked={enabled} label={`${TITLE}, ${formatDDMM(date)}`} onChange={(on) => {
        updateSettings(s => ({ talkDates: [...s.talkDates.filter(d => d !== date), ...(on ? [date] : [])] }));
      }} />}
    />
  );
}

export function TalkHero() {
  const { seconds } = useClock('second');
  const started = seconds >= startSecond;
  const remaining = Math.max(0, (started ? talkEndSecond : startSecond) - seconds);
  return (
    <div class="hero-box">
      <div class="hero hero--lesson" style="--c:var(--accent)">
        <ProgressRing size={136} stroke={12} color="var(--c)" label="Ход встречи"
          progress={started ? Math.min(1, (seconds - startSecond) / (talkEndSecond - startSecond)) : 0}>
          <span class="hero__timer hero__timer--long tabular">{formatTimer(remaining)}</span>
          <span class="t-footnote t-secondary">{started ? 'до конца' : 'до начала'}</span>
        </ProgressRing>
        <div class="hero__side">
          <span class="hero__eyebrow t-footnote t-upper">{started ? 'Идёт встреча' : 'До встречи'}</span>
          <p class="t-title2">{TITLE}</p>
          <p class="t-subhead t-secondary tabular">{START}–{END}</p>
        </div>
      </div>
    </div>
  );
}
