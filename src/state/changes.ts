// Хранилище изменений расписания (этап 2): временные расписания, изменения на даты, свои предметы.
// Записи не удаляются насовсем: удаление — пометка deleted с новым updatedAt (нужно для выгрузки на этапе 4).
// Сначала меняем память и сразу перерисовываем экраны, потом записываем в IndexedDB.
// Другие окна приложения узнают об изменениях через BroadcastChannel и перечитывают базу.

import { useEffect, useState } from 'preact/hooks';
import type { DateOverride, Lesson, SchedulePeriod, UserSubject } from '../core/schedule';
import { isValidDate, isValidTime, WEEKDAY_KEYS } from '../core/time';
import { showToast } from '../ui/overlays';
import { openChangesDb, RECORD_STORES, type ChangesDb, type ChangesSnapshot, type RecordStore } from './db';

export type Undo = () => void;

export interface ChangesState {
  /** Действующие (не удалённые) временные расписания по дате начала. */
  periods: SchedulePeriod[];
  /** Действующие изменения на даты: по дате, внутри даты — в порядке создания. */
  overrides: DateOverride[];
  /** Свои предметы пользователя. */
  subjects: UserSubject[];
  /** Записи уже прочитаны с устройства (или хранилище недоступно и ждать нечего). */
  ready: boolean;
  /** Хранилище недоступно — изменения живут только до перезагрузки. */
  storageError?: string;
}

type AnyRecord = SchedulePeriod | DateOverride | UserSubject;
type Tables = { [K in RecordStore]: Map<string, ChangesSnapshot[K][number]> };

/** Канал, по которому окна приложения сообщают друг другу «я записало изменения». */
const CHANNEL = 'ucheba-changes';
export const OPEN_ERROR = 'Хранилище недоступно — изменения сохранятся только до перезагрузки';
export const WRITE_ERROR = 'Не удалось сохранить изменения на устройстве';
/** Короткие тексты для уведомления внизу (полное объяснение — в storageError). */
const TOAST_TEXT: Record<string, string> = {
  [OPEN_ERROR]: 'Изменения сохранятся только до перезагрузки',
  [WRITE_ERROR]: WRITE_ERROR,
};

const emptyTables = (): Tables => ({ periods: new Map(), overrides: new Map(), subjects: new Map() });

let tables: Tables = emptyTables();
let state: ChangesState = { periods: [], overrides: [], subjects: [], ready: false };
const listeners = new Set<(s: ChangesState) => void>();

/** Номер запуска initChanges: ответы старой базы после повторного запуска не учитываются. */
let generation = 0;
/** Записывать ли на устройство (false — хранилище в памяти: превью и тесты). */
let persistent = false;
/** База открыта и прочитана; null — хранилище недоступно (или не нужно). */
let dbReady: Promise<ChangesDb | null> = Promise.resolve(null);
/** Записи по очереди, одна за другой. */
let writeChain: Promise<void> = Promise.resolve();
/** Что ещё не записано: id по хранилищам (если запись не удалась — попробуем вместе со следующей). */
type Dirty = Record<RecordStore, Set<string>>;
const emptyDirty = (): Dirty => ({ periods: new Set(), overrides: new Set(), subjects: new Set() });
let dirty: Dirty = emptyDirty();
let channel: BroadcastChannel | null = null;
let stopWatching: (() => void) | null = null;
/** Уведомление об ошибке хранилища показываем один раз. */
let errorShown = false;

// ---------- Порядок и время ----------

function timeOf(iso: unknown): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Кто создан раньше; при равенстве — по id, чтобы порядок был стабильным (как в resolveDay). */
function byCreated(a: AnyRecord, b: AnyRecord): number {
  return timeOf(a.createdAt) - timeOf(b.createdAt) || a.id.localeCompare(b.id);
}

/** Время изменения записи: сейчас, но строго позже прошлой версии — так «новее» всегда значит «позже». */
function stampAfter(prev: AnyRecord | undefined, now: number): string {
  return new Date(prev ? Math.max(now, timeOf(prev.updatedAt) + 1) : now).toISOString();
}

function liveList<K extends RecordStore>(kind: K): ChangesSnapshot[K] {
  const live = [...tables[kind].values()].filter((r) => !r.deleted) as AnyRecord[];
  if (kind === 'periods')
    (live as SchedulePeriod[]).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || byCreated(a, b));
  else if (kind === 'overrides') (live as DateOverride[]).sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
  else live.sort(byCreated);
  return live as ChangesSnapshot[K];
}

function notify() {
  listeners.forEach((l) => l(state));
}

/** Пересобрать списки изменённых хранилищ (остальные списки — те же объекты, чтобы не сбрасывать кеши). */
function refresh(kinds: Iterable<RecordStore>, patch: Partial<ChangesState> = {}) {
  const next: ChangesState = { ...state, ...patch };
  for (const kind of new Set(kinds)) (next as unknown as Record<RecordStore, AnyRecord[]>)[kind] = liveList(kind);
  state = next;
  notify();
}

// ---------- Проверка записей с устройства ----------

const isText = (v: unknown): v is string => typeof v === 'string';
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const isRooms = (v: unknown) => Array.isArray(v) && v.every(isText);

/** Пара целиком (partial — для замены: только изменённые поля). */
function isLesson(v: unknown, partial = false): v is Lesson {
  if (!isObject(v)) return false;
  const need = (value: unknown, check: (v: unknown) => boolean) => (partial ? optional(value, check) : check(value));
  return (
    need(v.start, isValidTime) &&
    need(v.end, isValidTime) &&
    need(v.subjectId, (s) => isText(s) && s.length > 0) &&
    optional(v.room, isText) &&
    optional(v.rooms, isRooms) &&
    optional(v.note, isText)
  );
}

const PERIOD_KINDS = ['custom', 'practice', 'break'];
const isWeekday = (v: unknown) => (WEEKDAY_KEYS as readonly unknown[]).includes(v);

/** Шаблон «Практика»: по нему редактор снова открывает период. */
function isPractice(v: unknown): boolean {
  return (
    isObject(v) &&
    isText(v.subjectId) &&
    isValidTime(v.start) &&
    isValidTime(v.end) &&
    optional(v.room, isText) &&
    optional(v.note, isText) &&
    Array.isArray(v.days) &&
    v.days.every(isWeekday)
  );
}

/**
 * Запись из базы годится для показа. Испорченную (например, после ручной правки) пропускаем:
 * иначе одна запись с неверным временем сломала бы всё расписание.
 */
export function isValidRecord(kind: RecordStore, value: unknown): boolean {
  if (!isObject(value) || !isText(value.id) || !value.id || !isText(value.createdAt) || !isText(value.updatedAt)) return false;
  if (!optional(value.deleted, (d) => typeof d === 'boolean')) return false;
  if (kind === 'periods') {
    const week = value.week;
    return (
      isText(value.title) &&
      isValidDate(value.from) &&
      isValidDate(value.to) &&
      isObject(week) &&
      Object.entries(week).every(([day, lessons]) => isWeekday(day) && Array.isArray(lessons) && lessons.every((l) => isLesson(l))) &&
      optional(value.kind, (k) => PERIOD_KINDS.includes(k as string)) &&
      optional(value.practice, isPractice)
    );
  }
  if (kind === 'subjects') {
    return isText(value.short) && isText(value.full) && isText(value.color) && isText(value.icon);
  }
  if (!isValidDate(value.date) || !optional(value.note, isText)) return false;
  switch (value.action) {
    case 'cancel':
      return isValidTime(value.target);
    case 'replace':
      return isValidTime(value.target) && isLesson(value.lesson, true);
    case 'add':
      return isLesson(value.lesson);
    case 'cancelDay':
      return true;
    default:
      return false;
  }
}

/** Записи с устройства или из другого окна: берём ту версию, что новее. Возвращает изменённые хранилища. */
function merge(snapshot: Partial<ChangesSnapshot>): RecordStore[] {
  const changed: RecordStore[] = [];
  for (const kind of RECORD_STORES) {
    const table = tables[kind] as Map<string, AnyRecord>;
    for (const record of (snapshot[kind] ?? []) as AnyRecord[]) {
      if (!isValidRecord(kind, record)) continue;
      const current = table.get(record.id);
      if (current && timeOf(record.updatedAt) <= timeOf(current.updatedAt)) continue;
      table.set(record.id, record);
      if (!changed.includes(kind)) changed.push(kind);
    }
  }
  return changed;
}

// ---------- Запись на устройство ----------

function storageFailed(message: string, error: unknown) {
  console.error(message, error);
  if (state.storageError !== message) {
    state = { ...state, storageError: message };
    notify();
  }
  if (!errorShown) {
    errorShown = true;
    showToast({ text: TOAST_TEXT[message] ?? message, icon: 'info', duration: 6000 });
  }
}

/** Записать изменённые записи. Пока база открывается, записи ждут; неудавшиеся попадут в следующую запись. */
function persist(kind: RecordStore, ids: Iterable<string>) {
  if (!persistent) return;
  for (const id of ids) dirty[kind].add(id);
  const gen = generation;
  const ready = dbReady;
  writeChain = writeChain.then(async () => {
    const db = await ready;
    if (!db || gen !== generation) return;
    // Берём записи в их последнем виде на момент записи.
    const batch: Partial<ChangesSnapshot> = {};
    const taken = dirty;
    dirty = emptyDirty();
    for (const k of RECORD_STORES) {
      const records = [...taken[k]].map((id) => tables[k].get(id)).filter(Boolean);
      if (records.length) (batch as Record<RecordStore, AnyRecord[]>)[k] = records as AnyRecord[];
    }
    if (!Object.keys(batch).length) return;
    try {
      await db.write(batch);
      if (gen !== generation) return;
      channel?.postMessage({ type: 'changed' });
      if (state.storageError === WRITE_ERROR) {
        state = { ...state, storageError: undefined };
        notify();
      }
    } catch (error) {
      if (gen !== generation) return;
      for (const k of RECORD_STORES) taken[k].forEach((id) => dirty[k].add(id));
      storageFailed(WRITE_ERROR, error);
    }
  });
}

/** Другое окно записало изменения — перечитать базу. */
async function reload(gen: number) {
  const db = await dbReady;
  if (!db || gen !== generation) return;
  try {
    const snapshot = await db.readAll();
    if (gen !== generation) return;
    const changed = merge(snapshot);
    if (changed.length) refresh(changed);
  } catch (error) {
    console.warn('Не удалось перечитать изменения расписания', error);
  }
}

function watchOtherWindows(gen: number) {
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => void reload(gen);
    channel = ch;
    stopWatching = () => ch.close();
    return;
  }
  // Без BroadcastChannel — перечитываем, когда окно снова на экране.
  if (typeof document === 'undefined') return;
  const onVisible = () => document.visibilityState === 'visible' && void reload(gen);
  document.addEventListener('visibilitychange', onVisible);
  stopWatching = () => document.removeEventListener('visibilitychange', onVisible);
}

// ---------- Запуск ----------

/**
 * Запуск хранилища. indexeddb — записи с устройства; memory — только в памяти (превью, тесты).
 * initial — начальные записи (примерные данные превью); на устройство они не записываются.
 * Если IndexedDB открыть не удалось, хранилище работает в памяти и показывает предупреждение.
 */
export async function initChanges(opts: {
  backend: 'indexeddb' | 'memory';
  initial?: { periods?: SchedulePeriod[]; overrides?: DateOverride[]; subjects?: UserSubject[] };
}): Promise<void> {
  const gen = ++generation;
  stopWatching?.();
  stopWatching = null;
  channel = null;
  void dbReady.then((db) => db?.close());
  dbReady = Promise.resolve(null);
  writeChain = Promise.resolve();
  dirty = emptyDirty();
  errorShown = false;

  tables = emptyTables();
  for (const kind of RECORD_STORES)
    for (const r of (opts.initial?.[kind] ?? []) as AnyRecord[]) (tables[kind] as Map<string, AnyRecord>).set(r.id, r);
  persistent = opts.backend === 'indexeddb';
  state = { periods: [], overrides: [], subjects: [], ready: !persistent };
  refresh(RECORD_STORES);
  if (!persistent) return;

  dbReady = openChangesDb().then(
    async (db) => {
      try {
        const snapshot = await db.readAll();
        if (gen !== generation) throw new Error('хранилище перезапущено');
        refresh(merge(snapshot), { ready: true });
        return db;
      } catch (error) {
        db.close();
        if (gen === generation) failOpen(error);
        return null;
      }
    },
    (error) => {
      if (gen === generation) failOpen(error);
      return null;
    },
  );
  watchOtherWindows(gen);
  await dbReady;
}

function failOpen(error: unknown) {
  persistent = false;
  dirty = emptyDirty();
  state = { ...state, ready: true };
  storageFailed(OPEN_ERROR, error);
}

export function getChanges(): ChangesState {
  return state;
}

/** Все записи вместе с удалёнными — для выгрузки (этап 4) и проверок. */
export function getChangesSnapshot(): ChangesSnapshot {
  return { periods: [...tables.periods.values()], overrides: [...tables.overrides.values()], subjects: [...tables.subjects.values()] };
}

/** Подписка на изменения (для кода вне компонентов). Возвращает отписку. */
export function subscribeChanges(listener: (s: ChangesState) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Хук: компонент перерисовывается при любом изменении. */
export function useChanges(): ChangesState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const off = subscribeChanges(setS);
    setS(state);
    return off;
  }, []);
  return s;
}

/** Дождаться, пока всё записано на устройство (для тестов и проверок). */
export function flushChanges(): Promise<void> {
  return writeChain;
}

function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  // Запасной вариант (старые браузеры или страница не по https): UUID v4 из случайных байтов.
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Новый id и текущее время — для новых записей. */
export function newStamp(): { id: string; now: string } {
  return { id: uuid(), now: new Date().toISOString() };
}

// ---------- Изменения и их отмена ----------

/** Применить новые версии записей: обновить списки, сообщить экранам, записать. */
function apply(kind: RecordStore, records: AnyRecord[]) {
  const table = tables[kind] as Map<string, AnyRecord>;
  for (const r of records) table.set(r.id, r);
  refresh([kind]);
  persist(kind, records.map((r) => r.id));
}

/**
 * Отмена: вернуть записи к прежнему виду (новые — пометить удалёнными, удалённые — вернуть).
 * Содержимое — прежнее, а updatedAt — время отмены, чтобы другие окна увидели, что запись снова изменилась.
 * Повторный вызов ничего не делает.
 */
function undoFor(kind: RecordStore, before: Map<string, AnyRecord | undefined>): Undo {
  const gen = generation;
  let used = false;
  return () => {
    if (used || gen !== generation || !before.size) return;
    used = true;
    const table = tables[kind] as Map<string, AnyRecord>;
    const now = Date.now();
    const restored: AnyRecord[] = [];
    for (const [id, prev] of before) {
      const current = table.get(id);
      if (!prev) {
        if (current && !current.deleted) restored.push({ ...current, deleted: true, updatedAt: stampAfter(current, now) });
      } else restored.push({ ...prev, updatedAt: stampAfter(current ?? prev, now) });
    }
    if (restored.length) apply(kind, restored);
  };
}

const noop: Undo = () => undefined;

/** Сохранить записи (по id: новые добавляются, существующие заменяются). Сохранённая запись — действующая. */
function upsert(kind: RecordStore, records: AnyRecord[]): Undo {
  const table = tables[kind] as Map<string, AnyRecord>;
  const before = new Map<string, AnyRecord | undefined>();
  const next = new Map<string, AnyRecord>();
  const now = Date.now();
  for (const r of records) {
    if (!r || !isText(r.id) || !r.id) continue;
    const prev = table.get(r.id);
    if (!before.has(r.id)) before.set(r.id, prev);
    const { deleted: _deleted, ...rest } = r;
    const updatedAt = stampAfter(prev, now);
    const createdAt = prev?.createdAt ?? (timeOf(r.createdAt) ? r.createdAt : updatedAt);
    next.set(r.id, { ...rest, createdAt, updatedAt } as AnyRecord);
  }
  if (!next.size) return noop;
  apply(kind, [...next.values()]);
  return undoFor(kind, before);
}

/** Пометить записи удалёнными. Уже удалённые и неизвестные id пропускаются. */
function tombstone(kind: RecordStore, ids: string[]): Undo {
  const table = tables[kind] as Map<string, AnyRecord>;
  const before = new Map<string, AnyRecord | undefined>();
  const now = Date.now();
  const next: AnyRecord[] = [];
  for (const id of new Set(ids)) {
    const prev = table.get(id);
    if (!prev || prev.deleted) continue;
    before.set(id, prev);
    next.push({ ...prev, deleted: true, updatedAt: stampAfter(prev, now) });
  }
  if (!next.length) return noop;
  apply(kind, next);
  return undoFor(kind, before);
}

/** Сохранить временное расписание (новое или изменённое). */
export function savePeriod(p: SchedulePeriod): Undo {
  return upsert('periods', [p]);
}

export function deletePeriod(id: string): Undo {
  return tombstone('periods', [id]);
}

/** Сохранить изменения на даты одним действием (и отменить их тоже разом). */
export function saveOverrides(list: DateOverride[]): Undo {
  return upsert('overrides', list);
}

export function deleteOverrides(ids: string[]): Undo {
  return tombstone('overrides', ids);
}

export function saveSubject(s: UserSubject): Undo {
  return upsert('subjects', [s]);
}

export function deleteSubject(id: string): Undo {
  return tombstone('subjects', [id]);
}
