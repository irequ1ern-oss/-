// ДЗ в памяти: один список на экран «ДЗ» и колонку «Ближайшее», чтобы отметки сразу были видны везде.
// До этапа 3 ДЗ не сохраняются: в превью это примерные данные, изменения живут до перезагрузки страницы.

import { useEffect, useState } from 'preact/hooks';
import { useAppData, type HomeworkItem } from '../../shell/app';
import type { TrackedHomework } from './stats';

interface Store {
  items: TrackedHomework[];
  listeners: Set<() => void>;
}

// Свой список на каждый источник данных (на странице превью их может быть несколько).
const stores = new WeakMap<HomeworkItem[], Store>();

function storeFor(source: HomeworkItem[]): Store {
  let s = stores.get(source);
  if (!s) {
    s = { items: source.map((h) => ({ ...h })), listeners: new Set() };
    stores.set(source, s);
  }
  return s;
}

export type HomeworkUpdate = (fn: (items: TrackedHomework[]) => TrackedHomework[]) => void;

/** Текущий список ДЗ и функция изменения. */
export function useHomework(): [TrackedHomework[], HomeworkUpdate] {
  const { homework } = useAppData();
  const store = storeFor(homework);
  const [, rerender] = useState(0);

  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    store.listeners.add(l);
    return () => void store.listeners.delete(l);
  }, [store]);

  const update: HomeworkUpdate = (fn) => {
    const next = fn(store.items);
    if (next === store.items) return;
    store.items = next;
    store.listeners.forEach((l) => l());
  };
  return [store.items, update];
}

/**
 * Сколько ДЗ не сделано — для счётчика на вкладке. Принимает исходный список,
 * потому что каркас (AppShell) сам создаёт AppDataContext и не может его прочитать.
 */
export function usePendingHomework(source: HomeworkItem[]): number {
  const store = storeFor(source);
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    store.listeners.add(l);
    return () => void store.listeners.delete(l);
  }, [store]);
  return store.items.filter((h) => !h.done).length;
}
