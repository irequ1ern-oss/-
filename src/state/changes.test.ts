import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateOverride, SchedulePeriod, UserSubject } from '../core/schedule';
import type { ChangesDb, ChangesSnapshot, RecordStore } from './db';

// Подделка базы: те же правила, что у настоящей обёртки (копии записей, «новее не затирать»).
const fake = vi.hoisted(() => ({
  stores: { periods: new Map<string, unknown>(), overrides: new Map<string, unknown>(), subjects: new Map<string, unknown>() },
  failOpen: false,
  failWrites: false,
  /** Пока не выполнен — база «открывается». */
  openGate: null as Promise<void> | null,
  writes: 0,
}));

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  const timeOf = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) || 0 : 0);
  const db: ChangesDb = {
    async readAll() {
      const all = (name: RecordStore) => [...fake.stores[name].values()].map((r) => structuredClone(r));
      return { periods: all('periods'), overrides: all('overrides'), subjects: all('subjects') } as ChangesSnapshot;
    },
    async write(changes) {
      if (fake.failWrites) throw new Error('QuotaExceededError');
      fake.writes++;
      for (const name of actual.RECORD_STORES) {
        for (const r of (changes[name] ?? []) as { id: string; updatedAt: string }[]) {
          const stored = fake.stores[name].get(r.id) as { updatedAt: string } | undefined;
          if (stored && timeOf(stored.updatedAt) > timeOf(r.updatedAt)) continue;
          fake.stores[name].set(r.id, structuredClone(r));
        }
      }
    },
    close() {},
  };
  return {
    ...actual,
    openChangesDb: async () => {
      if (fake.openGate) await fake.openGate;
      if (fake.failOpen) throw new Error('SecurityError');
      return db;
    },
  };
});

vi.mock('../ui/overlays', () => ({ showToast: vi.fn() }));

const { showToast } = await import('../ui/overlays');
const store = await import('./changes');
const {
  deleteOverrides, deletePeriod, deleteSubject, flushChanges, getChanges, getChangesSnapshot, initChanges, isValidRecord,
  newStamp, saveOverrides, savePeriod, saveSubject, subscribeChanges, OPEN_ERROR, WRITE_ERROR,
} = store;

const T0 = '2026-10-01T10:00:00.000Z';

function period(id: string, from: string, to: string, extra: Partial<SchedulePeriod> = {}): SchedulePeriod {
  return { id, title: `Период ${id}`, from, to, week: {}, createdAt: T0, updatedAt: T0, ...extra };
}

function cancel(id: string, date: string, target: string, createdAt = T0, extra: Partial<DateOverride> = {}): DateOverride {
  return { id, date, action: 'cancel', target, createdAt, updatedAt: createdAt, ...extra } as DateOverride;
}

function subject(id: string, extra: Partial<UserSubject> = {}): UserSubject {
  return { id, short: 'Практика', full: 'Учебная практика', color: 'mint', icon: 'hammer', createdAt: T0, updatedAt: T0, ...extra };
}

const ids = (list: { id: string }[]) => list.map((r) => r.id);
const all = <K extends RecordStore>(kind: K) => getChangesSnapshot()[kind] as ChangesSnapshot[K];
const record = <K extends RecordStore>(kind: K, id: string) => all(kind).find((r) => r.id === id);
/** Подождать, пока BroadcastChannel доставит сообщение и база перечитается. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T07:00:00.000Z'));
  for (const s of Object.values(fake.stores)) s.clear();
  Object.assign(fake, { failOpen: false, failWrites: false, openGate: null, writes: 0 });
  vi.mocked(showToast).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('хранилище изменений в памяти', () => {
  beforeEach(() => initChanges({ backend: 'memory' }));

  it('сразу готово, без ошибок и записей', () => {
    expect(getChanges()).toEqual({ periods: [], overrides: [], subjects: [], ready: true });
  });

  it('начальные записи: только действующие, периоды по дате начала, изменения по дате и порядку создания', async () => {
    await initChanges({
      backend: 'memory',
      initial: {
        periods: [period('b', '2026-11-02', '2026-11-13'), period('a', '2026-10-19', '2026-10-31'), period('x', '2026-10-01', '2026-10-05', { deleted: true })],
        overrides: [
          cancel('o3', '2026-10-15', '11:55', '2026-10-02T10:00:00.000Z'),
          cancel('o1', '2026-10-15', '09:00', '2026-10-01T10:00:00.000Z'),
          cancel('o0', '2026-10-13', '13:00', '2026-10-05T10:00:00.000Z'),
          cancel('gone', '2026-10-14', '09:00', T0, { deleted: true }),
        ],
        subjects: [subject('s2', { createdAt: '2026-10-03T00:00:00.000Z' }), subject('s1')],
      },
    });
    const s = getChanges();
    expect(s.ready).toBe(true);
    expect(ids(s.periods)).toEqual(['a', 'b']);
    expect(ids(s.overrides)).toEqual(['o0', 'o1', 'o3']);
    expect(ids(s.subjects)).toEqual(['s1', 's2']);
    // Удалённые записи остаются в базе (для выгрузки), но не в списках.
    expect(ids(all('periods'))).toContain('x');
  });

  it('новое расписание: createdAt из записи, updatedAt — сейчас; отмена помечает удалённым', () => {
    const undo = savePeriod(period('p1', '2026-10-19', '2026-10-31', { createdAt: '2026-10-12T06:59:00.000Z' }));
    const saved = getChanges().periods[0];
    expect(saved).toMatchObject({ id: 'p1', createdAt: '2026-10-12T06:59:00.000Z', updatedAt: '2026-10-12T07:00:00.000Z' });
    expect(saved.deleted).toBeUndefined();

    undo();
    expect(getChanges().periods).toEqual([]);
    expect(record('periods', 'p1')).toMatchObject({ deleted: true, title: 'Период p1' });
  });

  it('без createdAt — ставится время сохранения', () => {
    savePeriod({ ...period('p1', '2026-10-19', '2026-10-31'), createdAt: '' });
    expect(getChanges().periods[0].createdAt).toBe('2026-10-12T07:00:00.000Z');
  });

  it('изменение: createdAt сохраняется, updatedAt растёт; отмена возвращает прежнее содержимое', () => {
    savePeriod(period('p1', '2026-10-19', '2026-10-31', { createdAt: '2026-10-12T06:00:00.000Z' }));
    const first = getChanges().periods[0];
    // В ту же миллисекунду: updatedAt всё равно строго позже.
    const undo = savePeriod({ ...first, title: 'Практика', to: '2026-11-07', createdAt: '2030-01-01T00:00:00.000Z' });
    const second = getChanges().periods[0];
    expect(second).toMatchObject({ title: 'Практика', to: '2026-11-07', createdAt: '2026-10-12T06:00:00.000Z' });
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));

    vi.setSystemTime(new Date('2026-10-12T07:00:05.000Z'));
    undo();
    const restored = getChanges().periods[0];
    expect({ ...restored, updatedAt: '' }).toEqual({ ...first, updatedAt: '' });
    // Время отмены — чтобы другие окна увидели, что запись снова поменялась.
    expect(restored.updatedAt).toBe('2026-10-12T07:00:05.000Z');
  });

  it('удаление — пометка deleted; отмена возвращает запись', () => {
    savePeriod(period('p1', '2026-10-19', '2026-10-31'));
    const undo = deletePeriod('p1');
    expect(getChanges().periods).toEqual([]);
    expect(record('periods', 'p1')?.deleted).toBe(true);
    undo();
    expect(ids(getChanges().periods)).toEqual(['p1']);
    expect(record('periods', 'p1')?.deleted).toBeUndefined();
  });

  it('повторная отмена ничего не делает', () => {
    savePeriod(period('p1', '2026-10-19', '2026-10-31'));
    const undoDelete = deletePeriod('p1');
    undoDelete();
    deletePeriod('p1'); // удалили снова — старая отмена не должна вернуть запись
    undoDelete();
    expect(getChanges().periods).toEqual([]);
  });

  it('удаление неизвестной или уже удалённой записи — ничего не меняет', () => {
    const listener = vi.fn();
    const off = subscribeChanges(listener);
    deletePeriod('nope')();
    savePeriod(period('p1', '2026-10-19', '2026-10-31'));
    deletePeriod('p1');
    listener.mockClear();
    deletePeriod('p1')();
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('пакет изменений сохраняется и отменяется одним действием', () => {
    saveOverrides([cancel('keep', '2026-10-14', '09:00')]);
    const undo = saveOverrides([cancel('a', '2026-10-15', '09:00'), cancel('b', '2026-10-15', '11:55'), { ...cancel('keep', '2026-10-14', '13:00') }]);
    expect(ids(getChanges().overrides)).toEqual(['keep', 'a', 'b']);
    undo();
    expect(ids(getChanges().overrides)).toEqual(['keep']);
    expect(getChanges().overrides[0]).toMatchObject({ target: '09:00' }); // изменённая вернулась, новые удалены
    expect(record('overrides', 'a')?.deleted).toBe(true);
  });

  it('удаление пакетом и его отмена', () => {
    saveOverrides([cancel('a', '2026-10-15', '09:00'), cancel('b', '2026-10-15', '11:55'), cancel('c', '2026-10-16', '09:00')]);
    const undo = deleteOverrides(['a', 'b', 'a', 'missing']);
    expect(ids(getChanges().overrides)).toEqual(['c']);
    undo();
    expect(ids(getChanges().overrides)).toEqual(['a', 'b', 'c']);
  });

  it('сохранённая запись всегда действующая (пометка deleted из записи не берётся)', () => {
    saveSubject(subject('s1', { deleted: true }));
    expect(ids(getChanges().subjects)).toEqual(['s1']);
  });

  it('удалённую запись можно сохранить снова; отмена снова её удаляет', () => {
    saveSubject(subject('s1'));
    deleteSubject('s1');
    const undo = saveSubject(subject('s1', { short: 'Практ.' }));
    expect(getChanges().subjects[0].short).toBe('Практ.');
    undo();
    expect(getChanges().subjects).toEqual([]);
    expect(record('subjects', 's1')).toMatchObject({ deleted: true, short: 'Практика' });
  });

  it('подписчики узнают о каждом изменении; не затронутые списки — те же объекты', () => {
    const seen: ReturnType<typeof getChanges>[] = [];
    const off = subscribeChanges((s) => seen.push(s));
    const before = getChanges();
    saveOverrides([cancel('a', '2026-10-15', '09:00')]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe(before);
    expect(seen[0].periods).toBe(before.periods);
    expect(seen[0].subjects).toBe(before.subjects);
    expect(seen[0].overrides).not.toBe(before.overrides);
    off();
    deleteOverrides(['a']);
    expect(seen).toHaveLength(1);
  });

  it('отмена после перезапуска хранилища ничего не делает', async () => {
    const undo = savePeriod(period('p1', '2026-10-19', '2026-10-31'));
    await initChanges({ backend: 'memory', initial: { periods: [period('p1', '2026-10-19', '2026-10-31')] } });
    undo();
    expect(ids(getChanges().periods)).toEqual(['p1']);
  });

  it('newStamp: UUID и время ISO', () => {
    const a = newStamp();
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.now).toBe('2026-10-12T07:00:00.000Z');
    expect(newStamp().id).not.toBe(a.id);
  });
});

describe('проверка записей с устройства', () => {
  it('годные записи', () => {
    expect(isValidRecord('periods', period('p', '2026-10-19', '2026-10-31', { week: { mon: [{ start: '09:00', end: '14:40', subjectId: 'x', room: '8' }] } }))).toBe(true);
    const practice = { subjectId: 'x', start: '09:00', end: '14:40', room: '8', days: ['mon', 'fri'] } as const;
    expect(isValidRecord('periods', period('p', '2026-10-19', '2026-10-31', { kind: 'practice', practice: { ...practice, days: [...practice.days] } }))).toBe(true);
    expect(isValidRecord('overrides', cancel('o', '2026-10-15', '09:00'))).toBe(true);
    expect(isValidRecord('overrides', { ...cancel('o', '2026-10-15', '09:00'), action: 'replace', lesson: { room: '12' } })).toBe(true);
    expect(isValidRecord('overrides', { id: 'd', date: '2026-11-04', action: 'cancelDay', note: 'День народного единства', createdAt: T0, updatedAt: T0 })).toBe(true);
    expect(isValidRecord('subjects', subject('s'))).toBe(true);
  });

  it('испорченные записи не берутся', () => {
    expect(isValidRecord('periods', null)).toBe(false);
    expect(isValidRecord('periods', { ...period('p', '2026-10-19', '2026-10-31'), from: '19.10.2026' })).toBe(false);
    expect(isValidRecord('periods', period('p', '2026-10-19', '2026-10-31', { week: { mon: [{ start: '9:00', end: '14:40', subjectId: 'x' }] } }))).toBe(false);
    expect(isValidRecord('periods', period('p', '2026-10-19', '2026-10-31', { week: { holiday: [] } as never }))).toBe(false);
    expect(isValidRecord('periods', period('p', '2026-10-19', '2026-10-31', { kind: 'holiday' as never }))).toBe(false);
    expect(isValidRecord('periods', period('p', '2026-10-19', '2026-10-31', { kind: 'practice', practice: { subjectId: 'x', start: '09:00', end: '14:40', days: ['пн'] as never } }))).toBe(false);
    expect(isValidRecord('overrides', { ...cancel('o', '2026-10-15', '09:00'), target: undefined })).toBe(false);
    expect(isValidRecord('overrides', { ...cancel('o', '2026-10-15', '09:00'), action: 'replace', lesson: { start: '25:00' } })).toBe(false);
    expect(isValidRecord('overrides', { ...cancel('o', '2026-10-15', '09:00'), action: 'add', lesson: { start: '09:00' } })).toBe(false);
    expect(isValidRecord('overrides', { ...cancel('o', '2026-10-15', '09:00'), action: 'move' })).toBe(false);
    expect(isValidRecord('overrides', { ...cancel('o', '2026-10-15', '09:00'), id: '' })).toBe(false);
    expect(isValidRecord('subjects', { ...subject('s'), icon: undefined })).toBe(false);
  });
});

describe('хранилище на устройстве (IndexedDB)', () => {
  it('читает записи с устройства, испорченные пропускает', async () => {
    fake.stores.periods.set('p1', period('p1', '2026-10-19', '2026-10-31'));
    fake.stores.overrides.set('o1', cancel('o1', '2026-10-15', '09:00'));
    fake.stores.overrides.set('bad', { id: 'bad', date: 'завтра', action: 'cancel', target: '09:00', createdAt: T0, updatedAt: T0 });
    fake.stores.overrides.set('gone', cancel('gone', '2026-10-16', '09:00', T0, { deleted: true }));
    await initChanges({ backend: 'indexeddb' });
    const s = getChanges();
    expect(s.ready).toBe(true);
    expect(s.storageError).toBeUndefined();
    expect(ids(s.periods)).toEqual(['p1']);
    expect(ids(s.overrides)).toEqual(['o1']);
  });

  it('пока база открывается — не готово; изменения, сделанные в это время, записываются потом', async () => {
    let open!: () => void;
    fake.openGate = new Promise((resolve) => (open = resolve));
    fake.stores.periods.set('old', period('old', '2026-09-01', '2026-09-05'));
    const started = initChanges({ backend: 'indexeddb' });
    expect(getChanges().ready).toBe(false);
    saveOverrides([cancel('early', '2026-10-15', '09:00')]);
    expect(ids(getChanges().overrides)).toEqual(['early']);
    open();
    await started;
    await flushChanges();
    expect(getChanges().ready).toBe(true);
    expect(ids(getChanges().periods)).toEqual(['old']);
    expect(fake.stores.overrides.has('early')).toBe(true);
  });

  it('изменения, удаления и отмены записываются на устройство', async () => {
    await initChanges({ backend: 'indexeddb' });
    savePeriod(period('p1', '2026-10-19', '2026-10-31'));
    const undo = deletePeriod('p1');
    await flushChanges();
    expect(fake.stores.periods.get('p1')).toMatchObject({ deleted: true });
    undo();
    await flushChanges();
    expect(fake.stores.periods.get('p1')).not.toHaveProperty('deleted');
    saveSubject(subject('s1'));
    deleteOverrides(['none']);
    await flushChanges();
    expect(fake.stores.subjects.get('s1')).toMatchObject({ short: 'Практика' });
  });

  it('база не открылась — работает в памяти, предупреждает один раз', async () => {
    fake.failOpen = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await initChanges({ backend: 'indexeddb' });
    expect(getChanges()).toMatchObject({ ready: true, storageError: OPEN_ERROR });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ text: 'Изменения сохранятся только до перезагрузки' }));
    savePeriod(period('p1', '2026-10-19', '2026-10-31'));
    deletePeriod('p1')();
    await flushChanges();
    expect(ids(getChanges().periods)).toEqual(['p1']);
    expect(fake.writes).toBe(0);
    expect(showToast).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('запись не удалась — предупреждение один раз; следующая удачная запись дописывает пропущенное', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await initChanges({ backend: 'indexeddb' });
    fake.failWrites = true;
    savePeriod(period('p1', '2026-10-19', '2026-10-31'));
    await flushChanges();
    savePeriod(period('p2', '2026-11-02', '2026-11-13'));
    await flushChanges();
    expect(getChanges().storageError).toBe(WRITE_ERROR);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ text: WRITE_ERROR }));
    expect(ids(getChanges().periods)).toEqual(['p1', 'p2']); // в памяти всё на месте

    fake.failWrites = false;
    saveSubject(subject('s1'));
    await flushChanges();
    expect([...fake.stores.periods.keys()].sort()).toEqual(['p1', 'p2']);
    expect(fake.stores.subjects.has('s1')).toBe(true);
    expect(getChanges().storageError).toBeUndefined();
    err.mockRestore();
  });

  it('запись сообщает другим окнам; сообщение из другого окна — перечитать базу', async () => {
    await initChanges({ backend: 'indexeddb' });
    const other = new BroadcastChannel('ucheba-changes');
    const heard = vi.fn();
    other.onmessage = heard;
    try {
      savePeriod(period('p1', '2026-10-19', '2026-10-31'));
      await flushChanges();
      await settle();
      expect(heard).toHaveBeenCalledTimes(1);

      // Другое окно поменяло запись и добавило новую…
      const mine = fake.stores.periods.get('p1') as SchedulePeriod;
      fake.stores.periods.set('p1', { ...mine, title: 'Из другого окна', updatedAt: '2026-10-12T08:00:00.000Z' });
      fake.stores.overrides.set('o9', cancel('o9', '2026-10-15', '09:00'));
      const listener = vi.fn();
      const off = subscribeChanges(listener);
      other.postMessage({ type: 'changed' });
      await settle();
      off();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(getChanges().periods[0].title).toBe('Из другого окна');
      expect(ids(getChanges().overrides)).toEqual(['o9']);

      // Старая версия из базы не затирает более новую в памяти.
      fake.stores.periods.set('p1', { ...mine, title: 'Старое', updatedAt: '2026-10-12T06:00:00.000Z' });
      other.postMessage({ type: 'changed' });
      await settle();
      expect(getChanges().periods[0].title).toBe('Из другого окна');
    } finally {
      other.close();
    }
  });

  it('в памяти (превью) с другими окнами не связывается', async () => {
    await initChanges({ backend: 'memory' });
    const other = new BroadcastChannel('ucheba-changes');
    const heard = vi.fn();
    other.onmessage = heard;
    try {
      savePeriod(period('p1', '2026-10-19', '2026-10-31'));
      await flushChanges();
      await settle();
      expect(heard).not.toHaveBeenCalled();
      expect(fake.writes).toBe(0);
    } finally {
      other.close();
    }
  });
});
