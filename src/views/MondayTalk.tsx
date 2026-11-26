import { weekdayKey, toMinutes } from '../core/time';
import { formatDDMM, formatTimer } from '../core/format';
import { useClock } from '../shell/clock';
import { useSettings, updateSettings } from '../state/settings';
import { Cell } from '../ui/List';
import { Switch } from '../ui/controls';
import { BellCard } from './today/BellCard';

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
    <BellCard phase={started ? 'Идёт встреча' : 'До встречи'} label={started ? 'До конца встречи' : 'До начала встречи'}
      value={formatTimer(remaining)} detail={`${START}–${END}`} footer={<strong>{TITLE}</strong>}
      progress={started ? (seconds - startSecond) / (talkEndSecond - startSecond) : undefined} />
  );
}
