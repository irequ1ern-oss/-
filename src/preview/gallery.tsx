// Страница превью дизайна (preview/index.html): приложение в рамках телефона и планшета,
// главный блок «Сегодня» во всех состояниях, цвета предметов и элементы дизайн-системы.
// Экраны не повторяем — показываем настоящее демо-приложение (preview/app.html) во фреймах.

import { render, type ComponentChildren, type RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../ui/fonts.css';
import '../ui/tokens.css';
import '../ui/base.css';
import { COLOR_NAMES, SUBJECT_COLORS } from '../core/colors';
import { formatDayMonth, weekdayShort } from '../core/format';
import { computeHero } from '../core/hero';
import { activeLessons, resolveDay } from '../core/schedule';
import { addDays, parseClockOverride, startOfWeek, type Clock } from '../core/time';
import { lessonPhase } from '../core/today';
import { mainSchedule } from '../data/schedule';
import { getSettings, initSettings, updateSettings, useSettings, type ThemeChoice } from '../state/settings';
import { subjectView } from '../state/subjects';
import { AppProviders } from '../shell/AppShell';
import { useActions, useAppData, type AppData } from '../shell/app';
import { startedClock, useClock, type ClockSource } from '../shell/clock';
import { navigate } from '../shell/nav';
import { useMediaQuery } from '../shell/useMediaQuery';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/iconData';
import { Cell, Group, IconTile } from '../ui/List';
import { OverlayHost } from '../ui/OverlayHost';
import { SubjectIcon } from '../ui/SubjectIcon';
import { Button, IconButton, Segmented, Switch } from '../ui/controls';
import { haptic } from '../ui/haptics';
import { openSheet, showToast } from '../ui/overlays';
import { LessonRow } from '../views/LessonRow';
import { PlusSheet } from '../views/PlusSheet';
import { Hero } from '../views/today/Hero';
import {
  PHONE_SIZE, TABLET_LANDSCAPE, TABLET_PORTRAIT, appUrl, externalPatch, fitScale, frameMaxHeight, routeHash, splitColumns,
  type FrameSize,
} from './galleryLogic';
import { PRESETS, PRESET_LABELS, type PresetName } from './presets';
import { demoData } from './sampleData';
import './gallery.css';

const SETTINGS_KEY = 'ucheba.preview.settings';
const APP_BASE = `${import.meta.env.BASE_URL}preview/app.html`;
const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];
/** Рамка устройства: поле --space-2 и граница 1px с каждой стороны. */
const BEZEL = 9;

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'amoled', label: 'AMOLED' },
];

/** Примерные данные и идущие часы для каждого из пяти состояний. */
const DEMOS = Object.fromEntries(
  PRESET_NAMES.map((name) => {
    const start = parseClockOverride(PRESETS[name])!;
    return [name, { data: demoData(start.date), clock: startedClock(start) }];
  }),
) as Record<PresetName, { data: AppData; clock: ClockSource }>;

const HERO_NOTES: Record<PresetName, string> = {
  lesson: 'Таймер до конца пары, кольцо — сколько прошло.',
  break: 'Сколько до следующей пары и куда идти.',
  before: 'Утром: через сколько первая пара и где она.',
  after: 'Пары закончились: первая пара следующего дня.',
  dayoff: 'Суббота и воскресенье: когда снова на учёбу.',
};

// ---------- Общие помощники ----------

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

/** Экран, открытый сейчас внутри фрейма (#/week). Фрейм с того же сайта, поэтому адрес читается. */
function frameHash(frame: HTMLIFrameElement | null): string {
  try {
    return routeHash(frame?.contentWindow?.location.hash);
  } catch {
    return '';
  }
}

/** Ширина элемента (обновляется при повороте экрана и изменении окна). */
function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return width;
}

/**
 * Сколько места по высоте отдать рамке, чтобы устройство было видно целиком под верхней панелью.
 * Пересчитываем только при смене ширины: на телефоне высота «прыгает», когда прячется адресная строка.
 */
function useFrameMaxHeight(): number {
  const read = () => frameMaxHeight(window.innerHeight, window.innerWidth < 600 ? 136 : 100);
  const [h, setH] = useState(read);
  useEffect(() => {
    let lastWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      setH(read());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return h;
}

/**
 * Адрес фрейма. Меняется только при смене состояния или темы — и тогда сохраняет экран,
 * который открыт внутри (например, «Неделю»), чтобы не начинать заново с «Сегодня».
 */
function useFrameSrc(frame: RefObject<HTMLIFrameElement>, state: PresetName, theme: ThemeChoice): string {
  return useMemo(() => appUrl(APP_BASE, { state, theme, hash: frameHash(frame.current) }), [state, theme]);
}

// ---------- Части страницы ----------

function SectionHead({ n, id, title, text, children }: { n: number; id: string; title: string; text?: string; children?: ComponentChildren }) {
  return (
    <header class="gal-head">
      <h2 id={id} class="gal-head__title t-title2">
        <span class="gal-head__num tabular">{n}</span>
        <span>{title}</span>
      </h2>
      {text && <p class="gal-head__text t-subhead t-secondary">{text}</p>}
      {children}
    </header>
  );
}

function StateChips({ value, onChange, label }: { value: PresetName; onChange: (v: PresetName) => void; label: string }) {
  return (
    <div class="gal-chips" role="radiogroup" aria-label={label}>
      {PRESET_NAMES.map((name) => (
        <button
          key={name}
          role="radio"
          aria-checked={name === value}
          class={`gal-chip pressable${name === value ? ' is-active' : ''}`}
          onClick={() => {
            if (name === value) return;
            haptic();
            onChange(name);
          }}
        >
          <span class="gal-chip__pill t-subhead">{PRESET_LABELS[name]}</span>
        </button>
      ))}
    </div>
  );
}

interface DeviceProps {
  kind: 'phone' | 'tablet';
  size: FrameSize;
  src: string;
  title: string;
  frame: RefObject<HTMLIFrameElement>;
  maxHeight: number;
}

/** Рамка устройства с настоящим приложением внутри, уменьшенным до ширины колонки. */
function Device({ kind, size, src, title, frame, maxHeight }: DeviceProps) {
  const slot = useRef<HTMLDivElement>(null);
  const width = useWidth(slot);
  const scale = fitScale(size, width - 2 * BEZEL, maxHeight - 2 * BEZEL);
  return (
    <div ref={slot} class="device-slot">
      <div class={`device device--${kind}`} style={`--s:${scale}`}>
        <div class="device__screen" style={`width:${size.width * scale}px;height:${size.height * scale}px`}>
          <iframe
            ref={frame}
            src={src}
            title={title}
            loading="lazy"
            width={size.width}
            height={size.height}
            style={`transform:scale(${scale})`}
          />
        </div>
      </div>
      <p class="device-slot__meta t-footnote t-secondary tabular">
        {size.width} × {size.height} · {Math.round(scale * 100)}%
      </p>
    </div>
  );
}

/** Ссылка «на весь экран»: в адрес попадает экран, который сейчас открыт во фрейме. */
function FullScreenLink({ frame, state, theme }: { frame: RefObject<HTMLIFrameElement>; state: PresetName; theme: ThemeChoice }) {
  return (
    <a
      class="gal-link pressable-dim"
      href={appUrl(APP_BASE, { state, theme })}
      target="_top"
      onClick={(e) => {
        (e.currentTarget as HTMLAnchorElement).href = appUrl(APP_BASE, { state, theme, hash: frameHash(frame.current) });
      }}
    >
      Открыть на весь экран
      <Icon name="arrow-square-out" size={18} />
    </a>
  );
}

function PhoneSection({ theme, route, maxHeight }: { theme: ThemeChoice; route: { hash: string } | null; maxHeight: number }) {
  const [state, setState] = useState<PresetName>('lesson');
  const frame = useRef<HTMLIFrameElement>(null);
  const src = useFrameSrc(frame, state, theme);

  // Переход из карточки предмета («Цвет, иконка и сокращение») открываем в телефоне.
  useEffect(() => {
    if (!route) return;
    try {
      const win = frame.current?.contentWindow;
      if (win && win.location.href !== 'about:blank') win.location.hash = route.hash;
    } catch {
      // Фрейм ещё не загрузился — ничего страшного.
    }
  }, [route]);

  return (
    <section id="phone" class="gal-section" aria-labelledby="phone-title">
      <SectionHead n={1} id="phone-title" title="Телефон" text="Так приложение выглядит на Android-телефоне. Время идёт, всё нажимается." />
      <StateChips value={state} onChange={setState} label="Момент дня для телефона" />
      <Device kind="phone" size={PHONE_SIZE} src={src} title="Приложение на телефоне" frame={frame} maxHeight={maxHeight} />
      <div class="gal-actions">
        <FullScreenLink frame={frame} state={state} theme={theme} />
      </div>
    </section>
  );
}

function TabletSection({ theme, maxHeight }: { theme: ThemeChoice; maxHeight: number }) {
  const [state, setState] = useState<PresetName>('lesson');
  const [portrait, setPortrait] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const src = useFrameSrc(frame, state, theme);
  const narrow = useMediaQuery('(max-width: 767px)');
  const size = portrait ? TABLET_PORTRAIT : TABLET_LANDSCAPE;

  return (
    <section id="tablet" class="gal-section" aria-labelledby="tablet-title">
      <SectionHead
        n={2}
        id="tablet-title"
        title="Планшет"
        text={portrait ? 'Вертикально: боковое меню и экран.' : 'Горизонтально: меню слева, экран и колонка «Ближайшее» справа.'}
      />
      <div class="gal-orient">
        <Segmented
          label="Ориентация планшета"
          value={portrait ? 'portrait' : 'landscape'}
          onChange={(v) => setPortrait(v === 'portrait')}
          options={[
            { value: 'landscape', label: 'Горизонтально' },
            { value: 'portrait', label: 'Вертикально' },
          ]}
        />
      </div>
      <StateChips value={state} onChange={setState} label="Момент дня для планшета" />
      <Device kind="tablet" size={size} src={src} title="Приложение на планшете" frame={frame} maxHeight={maxHeight} />
      <div class="gal-actions">
        {narrow ? (
          <p class="t-footnote t-secondary">Вживую планшетный вид — если открыть эту страницу на планшете.</p>
        ) : (
          <FullScreenLink frame={frame} state={state} theme={theme} />
        )}
      </div>
    </section>
  );
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

function clockLabel(clock: Clock): string {
  return `${weekdayShort(clock.date)}, ${formatDayMonth(clock.date)} · ${two(Math.floor(clock.minutes / 60))}:${two(clock.minutes % 60)}`;
}

/** Главный блок одного состояния. Часы свои у каждой карточки и идут каждую секунду. */
function HeroCard({ name }: { name: PresetName }) {
  const clock = useClock('second');
  const { src } = useAppData();
  const { hero, today } = useMemo(() => computeHero(clock, src), [clock, src]);
  return (
    <figure class="gal-hero">
      <figcaption class="gal-hero__cap">
        <span class="gal-hero__top">
          <span class="t-headline">{PRESET_LABELS[name]}</span>
          <span class="t-footnote t-secondary tabular">{clockLabel(clock)}</span>
        </span>
        <span class="t-footnote t-secondary">{HERO_NOTES[name]}</span>
      </figcaption>
      <Hero hero={hero} today={clock.date} totalToday={activeLessons(today).length} />
    </figure>
  );
}

function HeroSection() {
  return (
    <section id="hero" class="gal-section" aria-labelledby="hero-title">
      <SectionHead
        n={3}
        id="hero-title"
        title="Главный блок «Сегодня»: 5 состояний"
        text="Настоящий компонент на разных моментах недели. Нажми на предмет — откроется его карточка."
      />
      <div class="gal-heroes">
        {PRESET_NAMES.map((name) => (
          <AppProviders key={name} data={DEMOS[name].data} clock={DEMOS[name].clock}>
            <HeroCard name={name} />
          </AppProviders>
        ))}
      </div>
    </section>
  );
}

interface TryItem {
  icon: IconName;
  color: string;
  title: string;
  text: string;
  hash: string;
  state?: PresetName;
}

const TRY_ITEMS: TryItem[] = [
  { icon: 'hand-tap', color: 'blue', title: 'Нажать на пару → карточка предмета', text: '«Сегодня», список пар внизу', hash: '#/today' },
  { icon: 'list-bullets', color: 'indigo', title: 'Долгое нажатие на пару → меню', text: 'Удерживай строку пары полсекунды', hash: '#/today' },
  { icon: 'pencil-simple', color: 'orange', title: 'Кнопка «+» → шторка', text: 'Круглая кнопка справа от вкладок', hash: '#/today' },
  { icon: 'calendar-dots', color: 'teal', title: 'Неделя: свайп влево/вправо по списку пар', text: 'Соседний день; в четверг — замена', hash: '#/week' },
  { icon: 'check-square', color: 'green', title: 'ДЗ: свайпы по строкам и статистика', text: 'Вправо — сделано, влево — перенести или удалить', hash: '#/homework' },
  { icon: 'gear-six', color: 'gray', title: 'Настройки: тема, подгруппа, предметы', text: 'Шестерёнка справа вверху на «Сегодня»', hash: '#/settings' },
  { icon: 'palette', color: 'purple', title: 'Цвет и иконка предмета', text: 'На примере МСС', hash: '#/settings/subjects/mss' },
];

/** Строка-ссылка в сгруппированном списке (как Cell, но настоящая ссылка). */
function LinkRow({ href, icon, title, subtitle, onClick }: { href: string; icon: ComponentChildren; title: string; subtitle?: string; onClick?: (e: MouseEvent) => void }) {
  return (
    <div class="cell cell--interactive">
      <a class="cell__row gal-linkrow" href={href} onClick={onClick}>
        <span class="cell__icon">{icon}</span>
        <span class="cell__content">
          <span class="cell__text">
            <span class="cell__title">{title}</span>
            {subtitle && <span class="cell__subtitle t-subhead">{subtitle}</span>}
          </span>
          <Icon name="caret-right" size={16} class="cell__chevron" />
        </span>
      </a>
    </div>
  );
}

function TrySection({ theme }: { theme: ThemeChoice }) {
  const wide = useMediaQuery('(min-width: 1000px)');
  const narrow = useMediaQuery('(max-width: 767px)');
  // Боковое меню есть только на планшете: на телефоне ведём к рамке планшета в разделе 2.
  const tablet = (
    <LinkRow
      key="tablet"
      href={narrow ? '#tablet' : appUrl(APP_BASE, { state: 'lesson', theme })}
      icon={<IconTile name="sidebar-simple" color="cyan" />}
      title="Планшет: боковое меню сворачивается кнопкой слева вверху"
      subtitle={narrow ? 'На телефоне меню нет — смотри раздел 2' : 'Открыть на весь экран'}
      onClick={
        narrow
          ? (e) => {
              e.preventDefault();
              scrollToSection('tablet');
            }
          : undefined
      }
    />
  );
  const rows = [
    ...TRY_ITEMS.map((it) => (
      <LinkRow
        key={it.title}
        href={appUrl(APP_BASE, { state: it.state ?? 'lesson', theme, hash: it.hash })}
        icon={<IconTile name={it.icon} color={it.color} />}
        title={it.title}
        subtitle={it.text}
      />
    )),
    tablet,
  ];
  return (
    <section id="try" class="gal-section" aria-labelledby="try-title">
      <SectionHead n={4} id="try-title" title="Что попробовать" text="Открывается приложение на весь экран. Вернуться сюда — кнопкой «Назад» телефона." />
      <div class="gal-cols">
        {splitColumns(rows, wide ? 2 : 1).map((col, i) => (
          <Group key={i}>{col}</Group>
        ))}
      </div>
    </section>
  );
}

function SubjectsSection() {
  const settings = useSettings();
  const { openSubject } = useActions();
  const wide = useMediaQuery('(min-width: 1000px)');
  const subjects = mainSchedule.subjects.map((s) => subjectView(s.id, mainSchedule, settings));
  return (
    <section id="subjects" class="gal-section" aria-labelledby="subjects-title">
      <SectionHead
        n={5}
        id="subjects-title"
        title="Предметы: цвета и иконки"
        text="Цвета подобраны автоматически: у предметов одного дня они разные. Нажми на предмет — карточка."
      />
      <div class="gal-cols">
        {splitColumns(subjects, wide ? 2 : 1).map((col, i) => (
          <Group key={i}>
            {col.map((s) => (
              <Cell
                key={s.id}
                class="gal-subject"
                icon={<SubjectIcon color={s.color} icon={s.icon} size={44} />}
                title={<span class="t-headline">{s.short}</span>}
                subtitle={
                  <>
                    <span class="gal-subject__full">{s.full}</span>
                    <span class="gal-subject__color t-footnote">
                      <span class="gal-subject__dot" style={`--c:var(--sc-${s.color})`} aria-hidden="true" />
                      {COLOR_NAMES[s.color]}
                    </span>
                  </>
                }
                accessory="chevron"
                onClick={() => openSubject(s.id)}
              />
            ))}
          </Group>
        ))}
      </div>
      <Group
        header="Палитра: 13 цветов"
        footer="Красный, розовый и серый автоматически не выдаются — их можно выбрать вручную в настройках предмета."
      >
        <ul class="gal-palette">
          {SUBJECT_COLORS.map((c) => (
            <li key={c} class="gal-swatch">
              <span class="gal-swatch__chip" style={`--c:var(--sc-${c})`} aria-hidden="true" />
              <span class="t-caption">{COLOR_NAMES[c]}</span>
            </li>
          ))}
        </ul>
      </Group>
    </section>
  );
}

/** Строки пар на примерных данных: прошедшая, текущая, следующая и замена в четверг. */
function SampleLessons() {
  const clock = useClock('minute');
  const { src } = useAppData();
  const { today, changed } = useMemo(() => {
    const thursday = resolveDay(addDays(startOfWeek(clock.date), 3), src);
    return {
      today: resolveDay(clock.date, src).lessons.slice(2, 5),
      changed: thursday.lessons.find((l) => l.status === 'changed'),
    };
  }, [clock.date, src]);
  return (
    <>
      {today.map((l) => (
        <LessonRow key={l.start} lesson={l} phase={lessonPhase(l, clock)} />
      ))}
      {changed && <LessonRow lesson={changed} extra="в четверг" />}
    </>
  );
}

function ElementsSection() {
  const [tab, setTab] = useState<'today' | 'week' | 'homework'>('today');
  const [vibrate, setVibrate] = useState(true);
  const [reminders, setReminders] = useState(false);
  const example = () => showToast({ text: 'Это только пример строки', icon: 'info' });

  return (
    <section id="elements" class="gal-section" aria-labelledby="elements-title">
      <SectionHead n={6} id="elements-title" title="Элементы" text="Из этих деталей собраны все экраны." />
      <div class="gal-grid">
        <Group header="Кнопки">
          <div class="gal-pad gal-row">
            <Button variant="filled">Основная</Button>
            <Button variant="tinted">Тонированная</Button>
            <Button variant="gray">Серая</Button>
            <Button variant="plain">Простая</Button>
          </div>
          <div class="gal-pad gal-row">
            <IconButton icon="gear-six" label="Стеклянная кнопка" variant="glass" />
            <IconButton icon="x" label="Серая кнопка" variant="gray" />
            <IconButton icon="plus" label="Кнопка акцента" variant="accent" />
            <IconButton icon="info" label="Простая кнопка" variant="plain" />
          </div>
        </Group>

        <Group header="Переключатели">
          <Cell
            title="Сегменты"
            below={
              <Segmented
                label="Пример сегментов"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'today', label: 'Сегодня' },
                  { value: 'week', label: 'Неделя' },
                  { value: 'homework', label: 'ДЗ' },
                ]}
              />
            }
          />
          <Cell title="Вибрация" accessory={<Switch checked={vibrate} onChange={setVibrate} label="Вибрация" />} />
          <Cell title="Напоминания" accessory={<Switch checked={reminders} onChange={setReminders} label="Напоминания" />} />
        </Group>

        <Group header="Строки списка" footer="Как в «Настройках»: цветная плашка, значение справа, стрелка.">
          <Cell icon={<IconTile name="palette" color="indigo" />} title="Тема" value="Авто" accessory="chevron" onClick={example} />
          <Cell icon={<IconTile name="users-three" color="green" />} title="Подгруппа" value="1-я" accessory="chevron" onClick={example} />
          <Cell
            icon={<IconTile name="check-square" color="orange" />}
            title="ДЗ"
            value={<Badge count={5} label="5 невыполненных" />}
            accessory="chevron"
            onClick={example}
          />
          <Cell icon={<IconTile name="info" color="gray" />} title="О приложении" accessory="chevron" onClick={example} />
        </Group>

        <Group header="Строки пар" footer="Нажми — карточка предмета. Удерживай — меню.">
          <SampleLessons />
        </Group>

        <Group header="Уведомление и шторка">
          <div class="gal-pad gal-row">
            <Button
              variant="tinted"
              icon="cloud-check"
              onClick={() => showToast({ text: 'Приложение готово работать без интернета', icon: 'cloud-check' })}
            >
              Показать уведомление
            </Button>
            <Button variant="filled" onClick={() => openSheet({ title: 'Создать', content: () => <PlusSheet /> })}>
              Открыть шторку «+»
            </Button>
          </div>
        </Group>
      </div>
    </section>
  );
}

const SECTIONS = [
  ['phone', 'Телефон'],
  ['tablet', 'Планшет'],
  ['hero', '«Сегодня»'],
  ['try', 'Попробовать'],
  ['subjects', 'Предметы'],
  ['elements', 'Элементы'],
] as const;

function Intro() {
  return (
    <div class="gal-intro">
      <p class="t-callout">Новый дизайн «Учёбы» на одной странице.</p>
      <p class="t-callout t-secondary">
        Нажимай на всё: это настоящее приложение на примерных данных (ДЗ и замена в четверг выдуманы). Правки пиши в чат: номер
        раздела и что поменять.
      </p>
      <nav class="gal-toc" aria-label="Разделы">
        {SECTIONS.map(([id, label], i) => (
          <a
            key={id}
            class="gal-chip pressable"
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToSection(id);
            }}
          >
            <span class="gal-chip__pill t-subhead">
              <span class="gal-toc__num tabular">{i + 1}</span>
              {label}
            </span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function Toolbar({ theme }: { theme: ThemeChoice }) {
  return (
    <header class="gal-bar glass">
      <div class="gal-bar__inner">
        <h1 class="gal-bar__title t-headline">Превью дизайна</h1>
        <div class="gal-bar__theme">
          <Segmented label="Тема" options={THEME_OPTIONS} value={theme} onChange={(t) => updateSettings({ theme: t })} />
        </div>
      </div>
    </header>
  );
}

function Gallery() {
  const { theme } = useSettings();
  const maxHeight = useFrameMaxHeight();
  const [phoneRoute, setPhoneRoute] = useState<{ hash: string } | null>(null);

  // Карточка предмета ведёт в настройки приложения (#/settings/subjects/mss).
  // На этой странице своих экранов нет, поэтому открываем их в телефоне из раздела 1.
  useEffect(() => {
    const onHash = () => {
      const hash = routeHash(location.hash);
      if (!hash) return;
      navigate({ tab: 'today', path: [] }, { replace: true }); // чтобы повторный переход тоже сработал
      history.replaceState(history.state, '', location.pathname + location.search);
      setPhoneRoute({ hash });
      scrollToSection('phone');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <AppProviders data={DEMOS.lesson.data} clock={DEMOS.lesson.clock}>
      <div class="gal">
        <Toolbar theme={theme} />
        <main class="gal-main">
          <Intro />
          <div class="gal-devices">
            <PhoneSection theme={theme} route={phoneRoute} maxHeight={maxHeight} />
            <TabletSection theme={theme} maxHeight={maxHeight} />
          </div>
          <HeroSection />
          <TrySection theme={theme} />
          <SubjectsSection />
          <ElementsSection />
        </main>
        <OverlayHost />
      </div>
    </AppProviders>
  );
}

initSettings(SETTINGS_KEY);

// Настройки, изменённые внутри фреймов (цвет предмета, подгруппа), сразу видны и здесь.
window.addEventListener('storage', (e) => {
  if (e.key !== SETTINGS_KEY) return;
  const patch = externalPatch(getSettings(), e.newValue);
  if (patch) updateSettings(patch);
});

render(<Gallery />, document.getElementById('app')!);
