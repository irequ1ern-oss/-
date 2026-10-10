// Главный блок «Сегодня»: пара / перемена / до пар / пары закончились / выходной.

import { Fragment } from 'preact';
import { lessonRoom, type ResolvedLesson } from '../../core/schedule';
import { tickHero, type HeroState, type NextStudyDay } from '../../core/hero';
import { capitalize, formatDayLong, formatDuration, formatRoom, formatTimer, lessonsCount } from '../../core/format';
import { activeLessons } from '../../core/schedule';
import { diffDays } from '../../core/time';
import { useSettings } from '../../state/settings';
import { useActions, useSubject } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { Icon } from '../../ui/Icon';
import { ProgressRing } from '../../ui/ProgressRing';
import { SubjectIcon } from '../../ui/SubjectIcon';
import type { IconName } from '../../ui/iconData';

/** «Иди в каб. 21» / «Иди в спортзал». Строка может перенестись только перед кабинетом (остальное — неразрывные пробелы). */
export function goToRoomText(room: string | undefined): string {
  if (!room) return 'Кабинет не указан';
  const label = formatRoom(room);
  return label.startsWith('каб.') ? `Иди\u00a0в ${label}` : `Иди\u00a0в ${label.toLowerCase()}`;
}

function useRoom(lesson: ResolvedLesson): string | undefined {
  const { subgroup } = useSettings();
  return lessonRoom(lesson, subgroup);
}

/** Части подписи через « · »; каждая не разрывается внутри («каб. 8», «Первая в 09:00»). */
function Parts({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          <span class="nowrap">{p}</span>
        </Fragment>
      ))}
    </>
  );
}

/** Строка предмета внутри главного блока: иконка, сокращение, подпись. */
function SubjectLine({ lesson, size, caption }: { lesson: ResolvedLesson; size: number; caption: string[] }) {
  const subject = useSubject(lesson.subjectId);
  const { openSubject } = useActions();
  return (
    <button
      class="hero-subject pressable"
      onClick={() => openSubject(lesson.subjectId)}
      aria-label={`${subject.full}. ${caption.join(', ')}`}
    >
      <SubjectIcon color={subject.color} icon={subject.icon} size={size} />
      <span class="hero-subject__text">
        <span class={`hero-subject__short ${size >= 44 ? 't-title3' : 't-headline'}`}>{subject.short}</span>
        <span class="t-subhead t-secondary tabular">
          <Parts parts={caption} />
        </span>
      </span>
    </button>
  );
}

/** Цифры таймера. С часами («1:39:00») — мельче, чтобы не налезать на кольцо. */
function Timer({ seconds, label }: { seconds: number; label: string }) {
  const text = formatTimer(seconds);
  return (
    <span class={seconds >= 3600 ? 'hero__timer hero__timer--long tabular' : 'hero__timer tabular'} aria-label={`${label} ${text}`}>
      {text}
    </span>
  );
}

/**
 * Таймеры с секундами идут здесь, а не во всём экране: состояние «Сегодня» пересчитывается
 * раз в минуту (и ровно на границе пары), а кольцо и цифры — каждую секунду.
 */
function useTicking<H extends HeroState>(hero: H): H {
  const clock = useClock('second');
  return tickHero(hero, clock.seconds);
}

function LessonHero({ hero: base }: { hero: Extract<HeroState, { kind: 'lesson' }> }) {
  const hero = useTicking(base);
  const subject = useSubject(hero.lesson.subjectId);
  const room = formatRoom(useRoom(hero.lesson));
  return (
    <div class="hero hero--lesson" style={`--c:var(--sc-${subject.color})`}>
      <ProgressRing size={136} stroke={12} progress={hero.progress} color="var(--c)" label="Прошло времени пары">
        <Timer seconds={hero.secondsLeft} label="До конца пары" />
        <span class="t-footnote t-secondary">до конца</span>
      </ProgressRing>
      <div class="hero__side">
        <span class="hero__eyebrow t-footnote t-upper">Идёт пара</span>
        <SubjectLine lesson={hero.lesson} size={44} caption={[room || 'Кабинет не указан']} />
        <span class="t-subhead t-secondary tabular">до {hero.lesson.end}</span>
      </div>
    </div>
  );
}

function BreakHero({ hero: base }: { hero: Extract<HeroState, { kind: 'break' }> }) {
  const hero = useTicking(base);
  const subject = useSubject(hero.next.subjectId);
  const room = useRoom(hero.next);
  const elapsed = hero.breakSeconds > 0 ? 1 - hero.secondsUntil / hero.breakSeconds : 1;
  return (
    <div class="hero hero--break" style={`--c:var(--sc-${subject.color})`}>
      <ProgressRing size={136} stroke={12} progress={elapsed} color="var(--c)" label="Прошло перемены">
        <Timer seconds={hero.secondsUntil} label="До пары" />
        <span class="t-footnote t-secondary">до пары</span>
      </ProgressRing>
      <div class="hero__side">
        <span class="hero__eyebrow t-footnote t-upper">Перемена</span>
        <p class="hero__goto t-title2">{goToRoomText(room)}</p>
        <SubjectLine lesson={hero.next} size={29} caption={[`в ${hero.next.start}`]} />
      </div>
    </div>
  );
}

function BeforeHero({ hero }: { hero: Extract<HeroState, { kind: 'before' }> }) {
  const room = formatRoom(useRoom(hero.first));
  const minutes = Math.ceil(hero.secondsUntil / 60);
  return (
    <div class="hero hero--stack hero--before">
      <div class="hero__lead">
        <span class="hero__eyebrow t-footnote t-upper">До первой пары</span>
        <p class="hero__big tabular">{formatDuration(minutes)}</p>
      </div>
      <SubjectLine lesson={hero.first} size={44} caption={[hero.first.start, room].filter(Boolean)} />
    </div>
  );
}

function NextDayBlock({ next, today }: { next: NextStudyDay | null; today: string }) {
  if (!next) return <p class="t-subhead t-secondary">Ближайших пар не найдено.</p>;
  // Относительное слово — только для завтра; дальше важнее день недели: «Понедельник, 19 октября».
  const date = formatDayLong(next.day.date);
  const title = diffDays(today, next.day.date) === 1 ? `Завтра, ${date}` : capitalize(date);
  return (
    <div class="hero__next">
      <span class="t-footnote t-upper t-secondary">{title}</span>
      <NextFirstLine next={next} />
    </div>
  );
}

function NextFirstLine({ next }: { next: NextStudyDay }) {
  const room = formatRoom(useRoom(next.first));
  const count = activeLessons(next.day).length;
  return (
    <div class="hero__next-row">
      <SubjectLine lesson={next.first} size={44} caption={[`Первая в ${next.first.start}`, room].filter(Boolean)} />
      <span class="hero__count t-footnote t-secondary">{lessonsCount(count)}</span>
    </div>
  );
}

function RestHero({ icon, title, text, next, today }: { icon: IconName; title: string; text?: string; next: NextStudyDay | null; today: string }) {
  return (
    <div class="hero hero--stack">
      <div class="hero__rest">
        <span class="hero__rest-icon">
          <Icon name={icon} weight="fill" size={26} />
        </span>
        <div>
          <p class="t-title2">{title}</p>
          {text && <p class="t-subhead t-secondary">{text}</p>}
        </div>
      </div>
      <NextDayBlock next={next} today={today} />
    </div>
  );
}

function HeroBody({ hero, today, totalToday }: { hero: HeroState; today: string; totalToday: number }) {
  switch (hero.kind) {
    case 'lesson':
      return <LessonHero hero={hero} />;
    case 'break':
      return <BreakHero hero={hero} />;
    case 'before':
      return <BeforeHero hero={hero} />;
    case 'after':
      return (
        <RestHero icon="moon-stars" title="На сегодня всё" text={`${capitalize(lessonsCount(totalToday))} позади`} next={hero.next} today={today} />
      );
    case 'dayoff': {
      const texts = {
        weekend: { icon: 'sun', title: 'Выходной', text: 'Можно отдохнуть' },
        holiday: { icon: 'confetti', title: hero.period?.title ?? 'Каникулы', text: hero.period ? `до ${formatDayLong(hero.period.to)}` : undefined },
        cancelled: { icon: 'calendar-x', title: 'Пары отменены', text: 'Сегодня все пары отменили' },
        free: { icon: 'coffee', title: 'Сегодня пар нет', text: undefined },
      } as const;
      const t = texts[hero.reason];
      return <RestHero icon={t.icon} title={t.title} text={t.text} next={hero.next} today={today} />;
    }
  }
}

/**
 * Главный блок. Обёртка — контейнер для @container в today.css: раскладка зависит от ширины,
 * которая досталась блоку (узкий телефон, планшет, карточка в галерее), а не от ширины окна.
 */
export function Hero(props: { hero: HeroState; today: string; totalToday: number }) {
  return (
    <div class="hero-box">
      <HeroBody {...props} />
    </div>
  );
}
