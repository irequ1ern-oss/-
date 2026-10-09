// Приложение в новом дизайне на примерных данных (страница preview/app.html).
// Параметры адреса: state=lesson|break|before|after|dayoff, theme=auto|light|dark|amoled,
// now=2026-10-12T10:17 (своё время), freeze (часы стоят — для скриншотов).

import { render } from 'preact';
import '../ui/fonts.css';
import '../ui/tokens.css';
import '../ui/base.css';
import { parseClockOverride, type Clock } from '../core/time';
import { initSettings, type ThemeChoice } from '../state/settings';
import { AppShell } from '../shell/AppShell';
import { startedClock, type ClockSource } from '../shell/clock';
import type { AppData } from '../shell/app';
import { demoData } from './sampleData';
import { PRESETS } from './presets';

const params = new URLSearchParams(location.search);
const state = (params.get('state') ?? 'lesson') as keyof typeof PRESETS;
const start: Clock = parseClockOverride(params.get('now')) ?? parseClockOverride(PRESETS[state] ?? PRESETS.lesson)!;
const theme = params.get('theme') as ThemeChoice | null;

initSettings('ucheba.preview.settings', theme ? { theme } : {});

const clock: ClockSource = params.has('freeze') ? { now: () => start, simulated: true } : startedClock(start);
const data: AppData = demoData(start.date);

render(<AppShell data={data} clock={clock} />, document.getElementById('app')!);
