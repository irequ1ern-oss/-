import { bellPair } from '../../core/bells';
import { tickHero, type HeroState } from '../../core/hero';
import { type ResolvedLesson, lessonRoom } from '../../core/schedule';
import { capitalize, formatDayMonth, formatRoom, formatTimer, lessonsCount, relativeDayName } from '../../core/format';
import { useSettings } from '../../state/settings';
import { useSubject, useActions } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { Icon } from '../../ui/Icon';
import { SubjectIcon } from '../../ui/SubjectIcon';
import { BellCard, openBells } from './BellCard';

function SubjectLine({ lesson, when }: { lesson: ResolvedLesson; when?: string }) {
  const subject = useSubject(lesson.subjectId);
  const { subgroup } = useSettings();
  const { openSubject } = useActions();
  const room = formatRoom(lessonRoom(lesson, subgroup));
  return (
    <button class="bell-subject pressable-dim" onClick={() => openSubject(lesson.subjectId)} aria-label={`${subject.full}, ${[when, room].filter(Boolean).join(', ')}`}>
      <SubjectIcon icon={subject.icon} color={subject.color} size={32} />
      <span class="bell-subject__name">
        {when && <small>{when}</small>}
        <strong>{subject.short}</strong>
      </span>
      {room && <span class="bell-subject__room"><Icon name="map-pin" size={15} />{room}</span>}
      <Icon name="caret-right" size={15} />
    </button>
  );
}

function NextPeriod({ lesson, start, continuation }: { lesson: ResolvedLesson; start: string; continuation: boolean }) {
  const subject = useSubject(lesson.subjectId);
  const { subgroup } = useSettings();
  const room = formatRoom(lessonRoom(lesson, subgroup));
  return (
    <p class="bell-next t-footnote">
      <Icon name="arrow-right" size={14} />
      {continuation ? `Продолжение в ${start}` : [`Далее в ${start}`, subject.short, room].filter(Boolean).join(' · ')}
    </p>
  );
}

type Timed = Extract<HeroState, { kind: 'lesson' | 'break' | 'before' }>;

function TimedHero({ base }: { base: Timed }) {
  const clock = useClock('second');
  const hero = tickHero(base, clock.seconds);
  if (hero.kind === 'before') return (
    <BellCard phase="До занятий" label="До первого урока" value={formatTimer(hero.secondsUntil)}
      detail={`Начало в ${hero.first.start}`} footer={<SubjectLine lesson={hero.first} />} />
  );
  const teaching = hero.kind === 'lesson';
  const lesson = teaching ? hero.lesson : hero.next;
  const pair = bellPair(lesson);
  const phase = teaching
    ? [pair && `Пара ${pair.number}`, hero.period.half ? `Урок ${hero.period.half} из 2` : 'Идёт занятие'].filter(Boolean).join(' · ')
    : hero.withinPair ? 'Перемена внутри пары' : 'Перемена между парами';
  return (
    <BellCard key={`${hero.kind}-${hero.period.start}`}
      phase={phase}
      label={teaching ? (hero.last ? 'До конца занятий' : 'До перемены') : 'До начала урока'}
      value={formatTimer(teaching ? hero.secondsLeft : hero.secondsUntil)}
      detail={teaching ? `Звонок в ${hero.period.end}` : `Начало в ${hero.period.start}`}
      progress={teaching ? hero.progress : 1 - hero.secondsUntil / hero.breakSeconds}
      footer={<>
        <SubjectLine lesson={lesson} when={teaching ? undefined : 'Следующий урок'} />
        {teaching && hero.following && <NextPeriod lesson={hero.following.lesson} start={hero.following.period.start}
          continuation={hero.following.lesson === lesson} />}
      </>}
    />
  );
}

export function Hero({ hero, today, totalToday }: { hero: HeroState; today: string; totalToday: number }) {
  if (hero.kind !== 'after' && hero.kind !== 'dayoff') return <TimedHero base={hero} />;
  const after = hero.kind === 'after';
  const title = after ? 'На сегодня всё' : ({
    weekend: 'Выходной', holiday: hero.period?.title ?? 'Каникулы', cancelled: 'Пары отменены', free: 'Свободный день',
  })[hero.reason];
  const next = hero.next;
  return (
    <section class="bell-card bell-card--rest">
      <header class="bell-card__head">
        <span class="bell-card__phase"><Icon name={after ? 'moon-stars' : 'calendar'} size={16} />{after ? `${lessonsCount(totalToday)} позади` : 'Расписание'}</span>
        <button class="bell-card__link pressable" onClick={openBells}><Icon name="bell" size={15} />Звонки</button>
      </header>
      <div class="bell-rest__body">
        <h2>{title}</h2>
        {next && <p class="bell-card__detail">{`${capitalize(relativeDayName(next.day.date, today) ?? formatDayMonth(next.day.date))} · первая пара в ${next.first.start}`}</p>}
      </div>
      {next && <div class="bell-card__foot"><SubjectLine lesson={next.first} /></div>}
    </section>
  );
}
