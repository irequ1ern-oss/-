// Приложение в новом дизайне на примерных данных (страница preview/app.html).
// Параметры адреса: state=lesson|break|before|after|dayoff, theme=auto|light|dark|amoled,
// now=2026-10-12T10:17 (своё время), freeze (часы стоят — для скриншотов).

import { render } from 'preact';
import '../ui/fonts.css';
import '../ui/tokens.css';
import '../ui/base.css';
import { parseClockOverride, type Clock } from '../core/time';
import { mainSchedule } from '../data/schedule';
import { initChanges } from '../state/changes';
import { initSettings, type ThemeChoice } from '../state/settings';
import { AppRoot } from '../shell/AppRoot';
import { startedClock, type ClockSource } from '../shell/clock';
import { demoChanges, demoData } from './sampleData';
import { PRESETS } from './presets';

const params = new URLSearchParams(location.search);
const state = (params.get('state') ?? 'lesson') as keyof typeof PRESETS;
const start: Clock = parseClockOverride(params.get('now')) ?? parseClockOverride(PRESETS[state] ?? PRESETS.lesson)!;
const theme = params.get('theme') as ThemeChoice | null;

initSettings('ucheba.preview.settings', theme ? { theme } : {});

const clock: ClockSource = params.has('freeze') ? { now: () => start, simulated: true } : startedClock(start);
// Изменения расписания превью живут только в памяти этого окна: на устройство не записываются
// и не смешиваются с изменениями настоящего приложения.
void initChanges({ backend: 'memory', initial: demoChanges(start.date) });
const { homework, events } = demoData(start.date);

render(<AppRoot base={{ main: mainSchedule, homework, events, demo: true }} clock={clock} />, document.getElementById('app')!);
