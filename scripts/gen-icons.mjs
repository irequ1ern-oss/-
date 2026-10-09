// Собирает нужные иконки Phosphor в src/ui/iconData.ts (только используемые, а не весь набор).
// Запуск: node scripts/gen-icons.mjs  — после добавления имени в список ниже.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASSETS = `${ROOT}node_modules/@phosphor-icons/core/assets`;

/** Иконки интерфейса. */
const UI = [
  'clock', 'calendar', 'calendar-dots', 'check-square', 'note', 'notepad', 'gear', 'gear-six', 'plus', 'caret-left',
  'caret-right', 'caret-down', 'caret-up', 'x', 'check', 'check-circle', 'circle', 'sidebar-simple', 'user', 'palette',
  'vibrate', 'info', 'list-bullets', 'map-pin', 'door-open', 'hourglass', 'coffee', 'trash', 'calendar-x',
  'arrows-clockwise', 'swap', 'flame', 'moon-stars', 'sun', 'sparkle', 'users', 'chalkboard-teacher', 'tray',
  'calendar-plus', 'arrow-right', 'confetti', 'wifi-slash', 'cloud-check', 'shield', 'git-branch', 'book-bookmark',
  'pencil-simple', 'clock-countdown', 'bell', 'paint-brush', 'arrow-u-up-left', 'hand-tap', 'flag',
];

/** Иконки предметов (можно выбрать в настройках). */
export const SUBJECT_ICONS = [
  'ruler', 'toolbox', 'atom', 'cube', 'gear', 'wrench', 'cpu', 'factory', 'scroll', 'bank', 'shield-check',
  'chart-line-up', 'compass-tool', 'pencil-ruler', 'barbell', 'globe', 'translate', 'book-open', 'book', 'flask',
  'calculator', 'math-operations', 'lightning', 'magnet', 'microscope', 'code', 'desktop', 'hammer', 'screwdriver',
  'nut', 'drop', 'thermometer', 'leaf', 'heartbeat', 'music-notes', 'paint-brush', 'briefcase', 'graduation-cap',
  'users-three', 'car',
];

const names = [...new Set([...UI, ...SUBJECT_ICONS])].sort();
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

const lines = [];
for (const name of names) {
  const regular = inner(readFileSync(`${ASSETS}/regular/${name}.svg`, 'utf8'));
  const fill = inner(readFileSync(`${ASSETS}/fill/${name}-fill.svg`, 'utf8'));
  lines.push(`  '${name}': [${JSON.stringify(regular)}, ${JSON.stringify(fill)}],`);
}

const out = `// Сгенерировано scripts/gen-icons.mjs из @phosphor-icons/core (MIT). Не редактировать вручную.
// Для каждой иконки: [контурная, залитая] — содержимое <svg viewBox="0 0 256 256">.

export const ICONS = {
${lines.join('\n')}
} as const;

export type IconName = keyof typeof ICONS;

/** Иконки, которые можно выбрать для предмета в настройках. */
export const SUBJECT_ICON_NAMES: IconName[] = ${JSON.stringify(SUBJECT_ICONS)};
`;
writeFileSync(`${ROOT}src/ui/iconData.ts`, out);
console.log(`Иконок: ${names.length}`);
