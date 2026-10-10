// Русские названия иконок предметов — для экранного диктора и подсказок в выборе иконки.

import type { IconName } from '../../ui/iconData';

const NAMES: Partial<Record<IconName, string>> = {
  ruler: 'Линейка',
  toolbox: 'Ящик с инструментами',
  atom: 'Атом',
  cube: 'Куб',
  gear: 'Шестерёнка',
  wrench: 'Гаечный ключ',
  cpu: 'Процессор',
  factory: 'Завод',
  scroll: 'Свиток',
  bank: 'Здание с колоннами',
  'shield-check': 'Щит с галочкой',
  'trend-up': 'График роста',
  'compass-tool': 'Циркуль',
  'pencil-ruler': 'Карандаш и линейка',
  barbell: 'Штанга',
  globe: 'Глобус',
  translate: 'Перевод',
  'book-open': 'Открытая книга',
  book: 'Книга',
  flask: 'Колба',
  calculator: 'Калькулятор',
  'math-operations': 'Математические знаки',
  lightning: 'Молния',
  magnet: 'Магнит',
  microscope: 'Микроскоп',
  code: 'Код',
  desktop: 'Компьютер',
  hammer: 'Молоток',
  screwdriver: 'Отвёртка',
  nut: 'Гайка',
  drop: 'Капля',
  thermometer: 'Термометр',
  leaf: 'Лист',
  heartbeat: 'Пульс',
  'music-notes': 'Ноты',
  'paint-brush': 'Кисть',
  briefcase: 'Портфель',
  'graduation-cap': 'Академическая шапочка',
  'users-three': 'Люди',
  car: 'Машина',
};

export function iconTitle(name: IconName): string {
  return NAMES[name] ?? name;
}
