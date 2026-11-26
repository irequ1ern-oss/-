// Экран «Сегодня» (раскладка L2: «Сейчас» крупно).

import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { computeHero, type DayProgress } from '../../core/hero';
import { activeLessons, type ResolvedLesson } from '../../core/schedule';
import { groupPairs, type Pair } from '../../core/bells';
import { forDayLabel, formatDayLong, formatDuration, greeting, lessonsCount } from '../../core/format';
import { PairList } from '../PairList';
import { useSettings } from '../../state/settings';
import { useAppData, useLayout, useSubject } from '../../shell/app';
import { ClockContext, useClock } from '../../shell/clock';
import { navigate } from '../../shell/nav';
import { Screen } from '../../ui/Screen';
import { IconButton } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { TalkHero, talkEndSecond } from '../MondayTalk';
import { StudyActions } from '../StudyEditor';
import { DueSoon } from '../UpcomingAside';
import { Hero } from './Hero';
import { FocusTimer } from './FocusTimer';
import './today.css';

export function TodayView({ focus = false }: { focus?: boolean }) {
  // Состояние экрана — с точностью до минуты; секунды идут только в таймере главного блока (Hero).
  const clock = useClock('minute');
  const { src, demo } = useAppData();
  const { name, talkDates } = useSettings();
  // ?now=… в адресе: часы идут от заданного момента — честно показываем, что время не настоящее.
  const testTime = useContext(ClockContext).simulated && !demo;
  const layout = useLayout();
  const state = useMemo(() => computeHero(clock, src), [clock, src]);
  const showTalk = state.hero.kind === 'before' && talkDates.includes(clock.date) && clock.seconds < talkEndSecond;
  useWakeAt(showTalk ? talkEndSecond : state.changesAt, clock.date);
  const { hero, today, progress } = state;
  const pairs = groupPairs(activeLessons(today));

  // Под главным блоком: сегодняшний список, а после пар и в выходной — следующий учебный день.
  const nextDay = hero.kind === 'after' || hero.kind === 'dayoff' ? hero.next : null;
  const listDay = nextDay ? nextDay.day : today;
  const listTitle = `Расписание ${forDayLabel(listDay.date, clock.date)}`;

  const card = showTalk ? <TalkHero /> : <Hero hero={hero} today={clock.date} totalToday={pairs.length} />;
  if (focus) return <FocusTimer date={clock.date}>{card}</FocusTimer>;
  return (
    <Screen
      title="Сегодня" class="screen--today"
      above={
        <div class="today-above">
          <p class="t-subhead t-secondary">{greeting(clock.minutes, name)}</p>
          <p class="t-footnote t-upper t-secondary today-above__date">{formatDayLong(clock.date)}</p>
          {testTime && (
            <p class="t-footnote today-test">
              <Icon name="clock-countdown" size={15} />
              <span>Тестовое время</span>
              <a class="today-test__reset" href={location.pathname + location.hash}>
                Сбросить
              </a>
            </p>
          )}
        </div>
      }
      trailing={
        <>
          <IconButton icon="corners-out" label="Крупный таймер" variant="glass" size={44}
            onClick={() => navigate({ tab: 'today', path: ['timer'] })} />
          {layout === 'phone' && <IconButton icon="gear-six" label="Настройки" variant="glass" size={44}
            onClick={() => navigate({ tab: 'settings', path: [] })} />}
        </>
      }
    >
      <div class="today">
        <div class="today__overview">
          {card}
          {progress && <DayProgressBar progress={progress} pairs={pairs} kind={hero.kind === 'break' && hero.withinPair ? 'lesson' : hero.kind} />}
          <StudyActions />
          <DueSoon />
        </div>
        <PairList key={listDay.date} day={listDay} clock={clock} title={listTitle} foldPast={!nextDay} />
      </div>
    </Screen>
  );
}

/**
 * Будит экран ровно на границе пары (конец пары, начало следующей), не дожидаясь минутного тика часов:
 * при перерисовке useClock('minute') уже отдаёт новую минуту, и состояние меняется вовремя.
 */
function useWakeAt(seconds: number | undefined, date: string) {
  const source = useContext(ClockContext);
  const [, wake] = useState(0);
  useEffect(() => {
    if (seconds === undefined) return;
    const now = source.now();
    if (now.date !== date || now.seconds >= seconds) return;
    // +50 мс — проснуться уже после границы, а не за миг до неё.
    const timer = window.setTimeout(() => wake((n) => n + 1), (seconds - now.seconds) * 1000 + 50);
    return () => window.clearTimeout(timer);
  }, [seconds, date, source]);
}

function DayProgressBar({ progress, pairs, kind }: { progress: DayProgress; pairs: Pair<ResolvedLesson>[]; kind: string }) {
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  // В перемену — сколько пар позади: «Перемена» уже в главном блоке, а короткая подпись
  // и на 360 px помещается в одну строку с «до конца учёбы 1 ч 22 мин».
  const left =
    kind === 'lesson'
      ? `Пара ${progress.index} из ${progress.total}`
      : kind === 'break'
        ? `Позади ${progress.index - 1} из ${progress.total}`
        : `Сегодня ${lessonsCount(progress.total)}`;
  const right =
    kind === 'before' ? `${first.start}–${last.end}` : `до конца учёбы ${formatDuration(Math.ceil(progress.remainingSeconds / 60))}`;
  return (
    <section class="day-progress" aria-label="Прогресс дня">
      <div class="day-progress__labels">
        <span class="t-subhead day-progress__left nowrap">{left}</span>
        <span class="t-subhead t-secondary tabular nowrap">{right}</span>
      </div>
      <div class="day-progress__bar" aria-hidden="true">
        {progress.segments.map((s, i) => (
          <SegmentFill key={i} value={s} subjectId={pairs[i].lessons[0].subjectId} />
        ))}
      </div>
    </section>
  );
}

function SegmentFill({ value, subjectId }: { value: number; subjectId: string }) {
  const subject = useSubject(subjectId);
  return (
    <span class="day-progress__seg">
      <span class="day-progress__fill" style={`--c:var(--sc-${subject.color});transform:scaleX(${value})`} />
    </span>
  );
}
