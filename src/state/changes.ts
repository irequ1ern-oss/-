// Хранилище изменений расписания (этап 2): временные периоды, изменения на даты, свои предметы.
// ЗАГОТОВКА: реализацию пишет этап 2; сигнатуры менять нельзя — на них опираются экраны.

import type { DateOverride, SchedulePeriod, UserSubject } from '../core/schedule';

export type Undo = () => void;

export interface ChangesState {
  periods: SchedulePeriod[];
  overrides: DateOverride[];
  subjects: UserSubject[];
  ready: boolean;
  storageError?: string;
}

const EMPTY: ChangesState = { periods: [], overrides: [], subjects: [], ready: false };
const noop: Undo = () => undefined;

export async function initChanges(_opts: {
  backend: 'indexeddb' | 'memory';
  initial?: { periods?: SchedulePeriod[]; overrides?: DateOverride[]; subjects?: UserSubject[] };
}): Promise<void> {}
export function getChanges(): ChangesState {
  return EMPTY;
}
export function useChanges(): ChangesState {
  return EMPTY;
}
export function newStamp(): { id: string; now: string } {
  return { id: String(Math.random()), now: new Date().toISOString() };
}
export function savePeriod(_p: SchedulePeriod): Undo {
  return noop;
}
export function deletePeriod(_id: string): Undo {
  return noop;
}
export function saveOverrides(_list: DateOverride[]): Undo {
  return noop;
}
export function deleteOverrides(_ids: string[]): Undo {
  return noop;
}
export function saveSubject(_s: UserSubject): Undo {
  return noop;
}
export function deleteSubject(_id: string): Undo {
  return noop;
}
