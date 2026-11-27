import { api, type Change, type Desk, type Identity } from './client';
const STORAGE = 'requiem.offline.v1';
interface Box {
  salt: string;
  iv: string;
  cipher: string;
}
export interface Snapshot {
  user: string;
  at: string;
  day: string;
  lessons: Desk['lessons'];
  tasks: Desk['tasks'];
  trips: Desk['records'];
  drafts: Change[];
}
interface Opened {
  key: CryptoKey;
  salt: string;
  box: string;
  snapshot: Snapshot;
  syncing?: Promise<void>;
}
let open: Opened | null = null;
const vaultChanges = new EventTarget();
export function subscribeVault(callback: () => void) {
  vaultChanges.addEventListener('change', callback);
  return () => vaultChanges.removeEventListener('change', callback);
}
function changed() {
  vaultChanges.dispatchEvent(new Event('change'));
}
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function base(a: Uint8Array) {
  let out = '';
  for (const c of a) out += String.fromCharCode(c);
  return btoa(out);
}
export function hasVault() {
  try {
    return !!localStorage.getItem(STORAGE);
  } catch {
    return false;
  }
}
export function lock() {
  open = null;
  changed();
}
export function opened() {
  return open?.snapshot ?? null;
}
async function derive(pw: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pw),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
async function commit(ctx: Opened, next: Snapshot) {
  const previous = ctx.box;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    ctx.key,
    new TextEncoder().encode(JSON.stringify(next)),
  );
  const box = JSON.stringify({
    salt: ctx.salt,
    iv: base(iv),
    cipher: base(new Uint8Array(cipher)),
  } satisfies Box);
  if ((localStorage.getItem(STORAGE) ?? '') !== previous)
    throw Error('Офлайн-копия изменилась в другой вкладке. Открой её заново.');
  localStorage.setItem(STORAGE, box);
  ctx.snapshot = next;
  ctx.box = box;
  changed();
}
function snapshot(u: Identity, d: Desk, drafts: Change[]): Snapshot {
  return {
    user: u.username,
    at: new Date().toISOString(),
    day: d.date,
    lessons: d.lessons,
    tasks: d.tasks,
    trips: d.records.filter((r) => r.kind === 'trip' && r.data.date === d.date),
    drafts,
  };
}
export async function createVault(pw: string, u: Identity, d: Desk) {
  if (pw.length < 12)
    throw Error('Для офлайн-копии нужна фраза длиной от 12 символов');
  if (hasVault()) throw Error('На устройстве уже есть офлайн-копия');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const next = snapshot(u, d, []);
  const ctx = {
    key: await derive(pw, salt),
    salt: base(salt),
    box: '',
    snapshot: next,
  };
  await commit(ctx, next);
  open = ctx;
  changed();
}
export async function unlock(pw: string) {
  const raw = localStorage.getItem(STORAGE);
  if (!raw) throw Error('Копия отсутствует');
  try {
    const box: Box = JSON.parse(raw),
      key = await derive(pw, bytes(box.salt));
    const data = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(box.iv) },
      key,
      bytes(box.cipher),
    );
    const snapshot = JSON.parse(new TextDecoder().decode(data)) as Snapshot;
    open = { key, salt: box.salt, box: raw, snapshot };
    changed();
    return snapshot;
  } catch {
    throw Error('Не удалось открыть копию. Проверь фразу.');
  }
}
export async function snapshotDesk(u: Identity, d: Desk) {
  if (open?.snapshot.user === u.username && d.username === u.username)
    await commit(open, snapshot(u, d, open.snapshot.drafts));
}
export async function writeDraft(change: Change) {
  if (!open) throw Error('Сначала открой копию');
  await commit(open, {
    ...open.snapshot,
    drafts: [...open.snapshot.drafts, change],
  });
}
export async function clearDrafts(ids: string[]) {
  if (open)
    await commit(open, {
      ...open.snapshot,
      drafts: open.snapshot.drafts.filter((d) => !ids.includes(d.id)),
    });
}
export function clearVault() {
  localStorage.removeItem(STORAGE);
  lock();
}

// Capture the unlocked vault. An account switch while a request is in flight
// must never clear a different local user's drafts.
export async function syncDrafts(username: string): Promise<void> {
  const ctx = open;
  if (!ctx || ctx.snapshot.user !== username || !ctx.snapshot.drafts.length)
    return;
  if (ctx.syncing) return ctx.syncing;
  const pending = [...ctx.snapshot.drafts];
  const send = async () => {
    for (let i = 0; i < pending.length && open === ctx; i += 100) {
      const batch = pending.slice(i, i + 100);
      await api('offline/sync', { username, changes: batch });
      if (open === ctx) await clearDrafts(batch.map((change) => change.id));
    }
  };
  ctx.syncing = send();
  try {
    await ctx.syncing;
  } finally {
    delete ctx.syncing;
  }
}
