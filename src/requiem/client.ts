export interface Identity {
  username: string;
  owner: boolean;
  admin: boolean;
}
export type Value = string | number | boolean | null | string[];
export type Fields = Record<string, Value>;
export interface Entry {
  kind: string;
  id: string;
  version: number;
  data: Fields;
  updated: string;
}
export interface Change {
  kind: string;
  id: string;
  version: number;
  data: Fields | null;
}
export interface FieldSchema {
  type?: string;
  enum?: string[];
  default?: Value;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  format?: string;
  pattern?: string;
  anyOf?: FieldSchema[];
}
export interface Schema {
  properties: Record<string, FieldSchema>;
  required?: string[];
}
export interface Lesson {
  date: string;
  start: string;
  end: string;
  subject: string;
  title: string;
  room: string;
}
export interface Train {
  number: string;
  dep: number;
  arr: number;
  leave: number;
  latest: number;
  tight: boolean;
  home: number | null;
  wait: number;
}
export interface Plan {
  skip: string[];
  first: number | null;
  end: number | null;
  train: Train | null;
  away_saved: number | null;
  makeup: number;
  net: number | null;
  reasons: string[];
  blocked: string[];
  unknown: string[];
  minutes: number;
  risk_points: number;
  impacts: { subject: string; before: number | null; after: number }[];
}
export interface Stat {
  subject: string;
  attended: number;
  total: number;
  percent: number | null;
  reserve: number | null;
  required: number | null;
  unit: string;
  recent: number | null;
  projected_full: number | null;
  target: number;
  streak: number;
  attainable: boolean | null;
  grades: {
    mean: number | null;
    fives: number | null;
    target: number;
    count: number;
  };
}
export interface Desk {
  username: string;
  date: string;
  today: string;
  records: Entry[];
  subjects: Record<string, { id: string; short: string; full: string }>;
  lessons: Lesson[];
  tomorrow: Lesson[];
  stats: Stat[];
  tasks: (Fields & {
    _id: string;
    title: string;
    blocked: boolean;
    due: string;
  })[];
  scenario: Plan;
  strategies: string[];
  schemas: Record<string, Schema>;
}
export async function apiResponse(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  let r: Response;
  try {
    r = await fetch('/api/' + path, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      'Связь с сервером прервалась. Введённые данные остаются в открытой форме.',
    );
  }
  if (!r.ok) {
    const payload = await r.json().catch(() => null);
    if (r.status === 401 && !['session', 'login'].includes(path))
      window.dispatchEvent(new Event('session-ended'));
    throw new Error(
      typeof payload?.detail === 'string'
        ? payload.detail
        : 'Сервер не смог обработать запрос',
    );
  }
  return r;
}
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await apiResponse(path, body, signal);
  return response.json();
}
export const hm = (m: number | null | undefined) =>
  m == null
    ? '—'
    : String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0') +
      ':' +
      String(((m % 60) + 60) % 60).padStart(2, '0') +
      (m >= 1440
        ? ' +' + Math.floor(m / 1440)
        : m < 0
          ? ' ' + Math.floor(m / 1440)
          : '');
export const mins = (m: number | null) =>
  m === null ? 'нет данных' : m + ' мин';
export const titles: Record<string, string> = {
  teacher: 'Профиль преподавателя',
  attendance: 'Посещаемость',
  subject: 'Профиль дисциплины',
  grade: 'Оценка',
  observation: 'Наблюдение о преподавателе',
  task: 'Задача',
  travel: 'Мой маршрут',
  trip: 'Рейс',
  ledger: 'Запись времени',
  strategy: 'Стратегия',
  critical: 'Обязательное занятие',
  memory: 'Память',
  note: 'Заметка',
  pulse: 'Самочувствие',
  term: 'Семестр',
  decision: 'Решение',
  workshop: 'Рабочее пространство',
  chat_settings: 'Настройки Shay',
  rule: 'Правило',
};
export const labels: Record<string, string> = {
  date: 'Дата',
  start: 'Начало',
  end: 'Окончание',
  subject: 'Предмет',
  teacher: 'Преподаватель',
  status: 'Отметка',
  target: 'Личная цель посещаемости, %',
  reserve: 'Неприкосновенный запас в единицах учёта',
  remaining: 'Осталось до конца семестра в единицах учёта',
  unit: 'Единица учёта',
  required: 'Обязательное присутствие',
  mastery: 'Освоение, 1–5',
  importance: 'Значимость, 1–5',
  makeup: 'Время на восполнение одного урока, мин',
  goal_grade: 'Целевая оценка',
  grade: 'Оценка',
  title: 'Название',
  outcome: 'Последствие',
  note: 'Комментарий',
  category: 'Категория',
  due: 'Срок',
  priority: 'Приоритет, 1–5',
  minutes: 'План, мин',
  repeat_days: 'Повтор через дней (0 — однократно)',
  spent: 'Факт, мин',
  done: 'Завершено',
  portable: 'Можно сделать в дороге',
  depends: 'Предыдущая задача',
  link: 'Ссылка',
  station: 'Вокзал у колледжа',
  destination: 'Станция у дома',
  metro: 'Метро, мин',
  walk: 'Пешком до вокзала, мин',
  cushion: 'Комфортный запас, мин',
  boarding: 'До начала посадки, мин',
  last_mile: 'От станции до дома, мин',
  number: 'Номер рейса',
  direction: 'Направление',
  departure: 'Отправление',
  arrival: 'Прибытие',
  overnight: 'Прибытие на следующий день',
  cancelled: 'Отменён',
  delay: 'Задержка, мин',
  time_weight: 'Свободное время, 1–5',
  grade_weight: 'Успеваемость, 1–5',
  attendance_weight: 'Посещаемость, 1–5',
  travel_weight: 'Дорога, 1–5',
  waiting_weight: 'Ожидание, 1–5',
  debt_weight: 'Долги, 1–5',
  comfort_weight: 'Комфорт, 1–5',
  rest_weight: 'Отдых, 1–5',
  self_weight: 'Предпочтение самообучения, 1–5',
  risk_weight: 'Риск, 1–5',
  recovery_weight: 'Отработки, 1–5',
  protect_required: 'Защитить обязательные уроки',
  protect_debts: 'Защитить предметы с долгами',
  source: 'Источник',
  confidence: 'Достоверность, %',
  active: 'Актуально',
  text: 'Текст',
  sleep: 'Сон, ч',
  fatigue: 'Усталость, 1–5',
  provider: 'Провайдер',
  model: 'Модель',
  style: 'Стиль',
  prompt: 'Личная инструкция',
  actual: 'Фактическая чистая экономия, мин',
  when: 'Условие',
  at: 'Время (МСК)',
  enabled: 'Включено',
  workload_lab: 'Laboratory · анализ вместимости дня',
  compact: 'Компактные панели',
  reduced_motion: 'Упрощённые эффекты',
  control: 'Контроль посещений, 1–5',
  demand: 'Требовательность, 1–5',
  makeup_difficulty: 'Сложность отработки, 1–5',
  independent: 'Можно освоить самостоятельно',
  tests: 'Контрольные и обязательные работы',
  weekdays_only: 'Только по будням',
  require_lessons: 'Есть уроки',
  require_debts: 'Есть долги',
  condition_mode: 'Совпадение условий',
  quiet_start: 'Тихие часы с',
  quiet_end: 'Тихие часы до',
  lead: 'Предупредить за, мин',
};
export const words: Record<string, string> = {
  present: 'Был',
  absent: 'Пропуск',
  excused: 'Уважительная',
  late: 'Опоздал',
  lesson: 'Уроки',
  minute: 'Минуты',
  none: 'Без последствий',
  remark: 'Замечание',
  makeup: 'Отработка',
  debt: 'Долг',
  material: 'Пропущен материал',
  other: 'Другое',
  practice: 'Практическая',
  exam: 'Контрольная',
  course: 'Курсовая',
  personal: 'Личное',
  reminder: 'Напоминание',
  homework: 'Домашняя работа',
  out: 'Из колледжа',
  in: 'В колледж',
  sleep: 'Сон',
  class: 'Занятия',
  travel: 'Дорога',
  wait: 'Ожидание',
  gap: 'Окно',
  self: 'Самообразование',
  project: 'Проект',
  rest: 'Отдых',
  free: 'Свободное время',
  fact: 'Факт',
  observation: 'Наблюдение',
  strategy: 'Стратегия',
  episode: 'Событие',
  morning: 'Утренний брифинг',
  departure: 'Время выхода',
  deadline: 'Близкий дедлайн',
  evening: 'Итоги дня',
};
export function download(
  name: string,
  data: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
