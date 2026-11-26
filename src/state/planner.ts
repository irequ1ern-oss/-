import { isValidDate } from '../core/time';
import { useSyncExternalStore } from 'preact/compat';
import { useAppData, type AppData, type HomeworkItem } from '../shell/app';
import { showToast } from '../ui/overlays';

export interface StudyNote {
  id: string;
  subjectId: string;
  text: string;
  date: string;
  updatedAt: number;
}

interface PlannerData {
  homework: HomeworkItem[];
  notes: StudyNote[];
}
type Change = (current: PlannerData) => PlannerData;

type NewEntry = { kind: 'homework'; item: HomeworkItem } | { kind: 'note'; item: StudyNote };
const pendingPrefix = 'ucheba.planner.inflight.';

function insert(current: PlannerData, entry: NewEntry): PlannerData {
  if (entry.kind === 'note') {
    return current.notes.some(n => n.id === entry.item.id) ? current : { ...current, notes: [entry.item, ...current.notes] };
  }
  return current.homework.some(h => h.id === entry.item.id) ? current : { ...current, homework: [...current.homework, entry.item] };
}

/** Новые записи, для которых нажали «Сохранить», но вкладку перезагрузили до завершения транзакции. */
function pendingEntries(): NewEntry[] {
  const entries: NewEntry[] = [];
  try {
    for (const key of Object.keys(sessionStorage).filter(k => k.startsWith(pendingPrefix))) {
      let e;
      try { e = JSON.parse(sessionStorage.getItem(key) ?? 'null'); } catch { continue; }
      if (!e?.item || key !== pendingPrefix + e.item.id || typeof e.item.subjectId !== 'string') continue;
      if (e.kind === 'note' && typeof e.item.text === 'string' && isValidDate(e.item.date) && Number.isFinite(e.item.updatedAt)) entries.push(e);
      if (e.kind === 'homework' && typeof e.item.title === 'string' && isValidDate(e.item.due) && typeof e.item.done === 'boolean') entries.push(e);
    }
  } catch { /* Хранилище вкладки может быть запрещено; основная запись идёт в IndexedDB. */ }
  return entries;
}

function clearPending(id: string) {
  try { sessionStorage.removeItem(pendingPrefix + id); } catch { /* Дополнительное хранилище недоступно. */ }
}

let connection: Promise<IDBDatabase> | undefined;
function openPlanner(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ucheba.planner', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('journal');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    }).catch(e => { connection = undefined; throw e; });
  }
  return connection;
}

/** Чтение и изменение — одна транзакция, в том числе когда дневник открыт в двух вкладках. */
async function transaction(seed: PlannerData, change?: Change): Promise<PlannerData> {
  const db = await openPlanner();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('journal', change ? 'readwrite' : 'readonly');
    const records = tx.objectStore('journal');
    const request = records.get('entries');
    let next: PlannerData;
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(tx.error);
    request.onsuccess = () => {
      const current: PlannerData = request.result ?? seed;
      try {
        next = change ? change(current) : current;
        if (change && next !== current) records.put(next, 'entries');
      } catch (error) {
        reject(error);
        tx.abort();
      }
    };
  });
}

function createPlanner(data: AppData) {
  const seed: PlannerData = { homework: data.homework, notes: [] };
  let snapshot = seed;
  const listeners = new Set<() => void>();
  let channel: BroadcastChannel | undefined;
  const publish = (next: PlannerData) => {
    snapshot = next;
    listeners.forEach(notify => notify());
  };
  const refresh = async () => {
    try { publish(await transaction(seed)); }
    catch { showToast({ text: 'Не удалось открыть дневник на этом устройстве', icon: 'info' }); }
  };
  async function update(change: Change): Promise<boolean> {
    try {
      const next = data.demo ? change(snapshot) : await transaction(seed, change);
      publish(next);
      channel?.postMessage('changed');
      return true;
    } catch (error) {
      showToast({ text: error instanceof PlannerConflict ? error.message : 'Не удалось сохранить. Проверь свободное место и попробуй ещё раз.', icon: 'info' });
      return false;
    }
  }
  async function load() {
    const pending = pendingEntries();
    if (!pending.length) return refresh();
    if (await update(s => pending.reduce(insert, s))) pending.forEach(e => clearPending(e.item.id));
    else await refresh();
  }
  return {
    snapshot: () => snapshot,
    subscribe(notify: () => void) {
      listeners.add(notify);
      if (!data.demo && listeners.size === 1) {
        if (typeof BroadcastChannel === 'function') {
          channel = new BroadcastChannel('ucheba.planner');
          channel.onmessage = refresh;
        }
        window.addEventListener('focus', refresh);
        void load();
      }
      return () => {
        listeners.delete(notify);
        if (!data.demo && !listeners.size) {
          window.removeEventListener('focus', refresh);
          channel?.close();
          channel = undefined;
        }
      };
    },
    update,
    async add(entry: NewEntry) {
      if (!data.demo) {
        try { sessionStorage.setItem(pendingPrefix + entry.item.id, JSON.stringify(entry)); } catch { /* IndexedDB всё ещё доступна. */ }
      }
      const ok = await update(s => insert(s, entry));
      if (ok && !data.demo) clearPending(entry.item.id);
      return ok;
    },
  };
}

export class PlannerConflict extends Error {}
const planners = new WeakMap<AppData, ReturnType<typeof createPlanner>>();

export function usePlanner(source?: AppData) {
  const context = useAppData();
  const data = source ?? context;
  let planner = planners.get(data);
  if (!planner) {
    planner = createPlanner(data);
    planners.set(data, planner);
  }
  return [useSyncExternalStore(planner.subscribe, planner.snapshot), planner.update, planner.add] as const;
}
