import { it, expect, vi, afterEach } from 'vitest';
import {
  createVault,
  hasVault,
  opened,
  unlock,
  lock,
  writeDraft,
  snapshotDesk,
  clearDrafts,
} from './vault';
import type { Desk, Identity, Change } from './client';

afterEach(() => {
  lock();
  vi.unstubAllGlobals();
});
it('keeps a dated snapshot and pending offline task encrypted across restarts', async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  const owner: Identity = {
    username: 'study-owner',
    owner: true,
    admin: false,
  };
  const desk = {
    date: '2026-11-25',
    lessons: [],
    tasks: [],
    records: [],
  } as unknown as Desk;
  const entry: Change = {
    kind: 'task',
    id: 'd1',
    version: 0,
    data: { title: 'Черновик курсовой' },
  };
  await createVault('Тестовая фраза для устройства', owner, desk);
  await writeDraft(entry);
  expect([...storage.values()].join('')).not.toContain('Черновик');
  lock();
  expect(hasVault()).toBe(true);
  expect(opened()).toBeNull();
  await expect(unlock('неверная фраза')).rejects.toThrow();
  await unlock('Тестовая фраза для устройства');
  await snapshotDesk(
    { ...owner, username: 'other' },
    { ...desk, date: '2026-11-26' },
  );
  expect(opened()?.day).toBe(desk.date);
  expect(opened()?.drafts).toEqual([entry]);
  await clearDrafts(['d1']);
  expect(opened()?.drafts).toEqual([]);
});
