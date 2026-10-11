// База IndexedDB на устройстве: маленькая обёртка на промисах (без сторонних библиотек).
// База «ucheba», версия 1: periods, overrides, subjects (ключ id) и meta (ключ key) — для следующих этапов.

import type { DateOverride, SchedulePeriod, UserSubject } from '../core/schedule';

export const DB_NAME = 'ucheba';
export const DB_VERSION = 1;
/** Хранилища записей изменений расписания (ключ — id). */
export const RECORD_STORES = ['periods', 'overrides', 'subjects'] as const;
export type RecordStore = (typeof RECORD_STORES)[number];
/** Служебное хранилище (ключ — key): понадобится на следующих этапах. */
export const META_STORE = 'meta';

/** Все записи по хранилищам — вместе с удалёнными (у них deleted: true). */
export interface ChangesSnapshot {
  periods: SchedulePeriod[];
  overrides: DateOverride[];
  subjects: UserSubject[];
}

export interface ChangesDb {
  readAll(): Promise<ChangesSnapshot>;
  /**
   * Записывает всё одной транзакцией. Запись, которая в базе новее (её только что сохранило
   * другое окно), не затирается — другое окно сообщит о ней, и это окно её перечитает.
   */
  write(changes: Partial<ChangesSnapshot>): Promise<void>;
  close(): void;
}

function timeOf(iso: unknown): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function wrap(db: IDBDatabase): ChangesDb {
  return {
    readAll() {
      return new Promise<ChangesSnapshot>((resolve, reject) => {
        const tx = db.transaction([...RECORD_STORES], 'readonly');
        const requests = RECORD_STORES.map((name) => tx.objectStore(name).getAll());
        tx.oncomplete = () => {
          const [periods, overrides, subjects] = requests.map((r) => r.result);
          resolve({ periods, overrides, subjects } as ChangesSnapshot);
        };
        tx.onabort = () => reject(tx.error ?? new Error('Чтение из IndexedDB отменено'));
      });
    },

    write(changes) {
      const names = RECORD_STORES.filter((name) => changes[name]?.length);
      if (!names.length) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(names, 'readwrite');
        tx.oncomplete = () => resolve();
        // Ошибка запроса откатывает всю транзакцию — об этом сообщит onabort.
        tx.onabort = () => reject(tx.error ?? new Error('Запись в IndexedDB отменена'));
        for (const name of names) {
          const store = tx.objectStore(name);
          for (const record of changes[name] as { id: string; updatedAt: string }[]) {
            const existing = store.get(record.id);
            existing.onsuccess = () => {
              const stored = existing.result as { updatedAt?: string } | undefined;
              if (stored && timeOf(stored.updatedAt) > timeOf(record.updatedAt)) return;
              store.put(record);
            };
          }
        }
      });
    },

    close() {
      db.close();
    },
  };
}

/** Открывает базу (и создаёт хранилища при первом запуске). Ошибка — если IndexedDB недоступна. */
export function openChangesDb(factory?: IDBFactory): Promise<ChangesDb> {
  return new Promise((resolve, reject) => {
    try {
      // Само обращение к indexedDB может бросить ошибку (запрет хранилища в настройках браузера).
      const idb = factory ?? globalThis.indexedDB;
      if (!idb) throw new Error('IndexedDB недоступна');
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of RECORD_STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Новая версия приложения в другой вкладке обновляет базу — уступаем ей, а не блокируем.
        db.onversionchange = () => db.close();
        resolve(wrap(db));
      };
      req.onerror = () => reject(req.error ?? new Error('Не удалось открыть IndexedDB'));
    } catch (error) {
      reject(error);
    }
  });
}
