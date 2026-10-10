// Экран «Сегодня» (раскладка L2: «Сейчас» крупно).

import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { computeHero, type DayProgress } from '../../core/hero';
import { activeLessons, type ResolvedLesson } from '../../core/schedule';
import { lessonPhase } from '../../core/today';
import { forDayLabel, formatDayLong, formatDuration, greeting, lessonsCount, plural } from '../../core/format';
import { toMinutes } from '../../core/time';
import { useSettings } from '../../state/settings';
import { useAppData, useLayout, useSubject } from '../../shell/app';
import { ClockContext, useClock } from '../../shell/clock';
import { navigate } from '../../shell/nav';
import { Screen } from '../../ui/Screen';
import { Group, Cell, IconTile } from '../../ui/List';
import { IconButton } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { LessonRow } from '../LessonRow';
import { Hero } from './Hero';
import './today.css';

export function TodayView() {
  // Состояние экрана — с точностью до минуты; секунды идут только в таймере главного блока (Hero).
  const clock = useClock('minute');
  const { src, demo } = useAppData();
  const { name } = useSettings();
  // ?now=… в адресе: часы идут от заданного момента — честно показываем, что время не настоящее.
  const testTime = useContext(ClockContext).simulated && !demo;
  const layout = useLayout();
  const state = useMemo(() => computeHero(clock, src), [clock, src]);
  useWakeAt(state.changesAt, clock.date);
  const { hero, today, progress, upNext } = state;
  const totalToday = activeLessons(today).length;

  // Под главным блоком: сегодняшний список, а после пар и в выходной — следующий учебный день.
  const nextDay = hero.kind === 'after' || hero.kind === 'dayoff' ? hero.next : null;
  const listDay = nextDay ? nextDay.day : today;
  const listTitle = `Расписание ${forDayLabel(listDay.date, clock.date)}`;

  return (
    <Screen
      title="Сегодня"
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
        layout === 'phone' ? (
          <IconButton icon="gear-six" label="Настройки" variant="glass" size={40} onClick={() => navigate({ tab: 'settings', path: [] })} />
        ) : undefined
      }
    >
      <div class="today">
        <Hero hero={hero} today={clock.date} totalToday={totalToday} />
        {progress && <DayProgressBar progress={progress} lessons={activeLessons(today)} kind={hero.kind} />}
        {/* До пар следующая пара уже в главном блоке, а «Далее» со второй парой только путает */}
        {upNext && hero.kind !== 'before' && <UpNext lesson={upNext} nowMinutes={clock.minutes} />}
        <DayList title={listTitle} lessons={listDay.lessons} isToday={!nextDay} clockDate={clock.date} clockMinutes={clock.minutes} />
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

function DayProgressBar({ progress, lessons, kind }: { progress: DayProgress; lessons: ResolvedLesson[]; kind: string }) {
  const first = lessons[0];
  const last = lessons[lessons.length - 1];
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
          <SegmentFill key={i} value={s} subjectId={lessons[i].subjectId} />
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

function UpNext({ lesson, nowMinutes }: { lesson: ResolvedLesson; nowMinutes: number }) {
  const until = toMinutes(lesson.start) - nowMinutes;
  return (
    <Group header="Далее">
      <LessonRow lesson={lesson} extra={until > 0 ? `через ${formatDuration(until)}` : undefined} />
    </Group>
  );
}

interface DayListProps {
  title: string;
  lessons: ResolvedLesson[];
  isToday: boolean;
  clockDate: string;
  clockMinutes: number;
}

/** Весь день компактным списком. Прошедшие пары свёрнуты в одну строку, чтобы не занимать экран. */
function DayList({ title, lessons, isToday, clockDate, clockMinutes }: DayListProps) {
  const [showPast, setShowPast] = useState(false);
  const clock = { date: clockDate, minutes: clockMinutes, seconds: clockMinutes * 60 };
  const phases = lessons.map((l) => (isToday ? lessonPhase(l, clock) : 'upcoming'));
  const pastCount = phases.findIndex((p) => p !== 'past');
  const leadingPast = pastCount === -1 ? lessons.length : pastCount;
  const collapse = isToday && leadingPast >= 2 && !showPast;

  if (lessons.length === 0) return null;
  return (
    <Group header={title}>
      {collapse && (
        <Cell
          class="past-toggle"
          icon={<IconTile name="check-fat" color="gray" />}
          title={`${leadingPast} ${plural(leadingPast, 'пара прошла', 'пары прошли', 'пар прошло')}`}
          subtitle={<span class="tabular">{lessons.slice(0, leadingPast).map((l) => l.start).join(' · ')}</span>}
          accessory={<Icon name="caret-down" size={16} class="cell__chevron" />}
          onClick={() => setShowPast(true)}
        />
      )}
      {lessons.map((l, i) =>
        collapse && i < leadingPast ? null : <LessonRow key={`${l.start}-${i}`} lesson={l} phase={phases[i]} />,
      )}
    </Group>
  );
}
