// Общие данные и действия приложения, доступные всем экранам.

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { MainSchedule, ScheduleSources } from '../core/schedule';
import type { DateStr } from '../core/time';
import { useSettings } from '../state/settings';
import { subjectView, type SubjectView } from '../state/subjects';

/** ДЗ (появятся на этапе 3; сейчас — только примеры в превью). */
export interface HomeworkItem {
  id: string;
  subjectId: string;
  title: string;
  due: DateStr;
  done: boolean;
}

/** Событие: контрольная, зачёт, сдача работы (этап 3). */
export interface EventItem {
  id: string;
  subjectId: string;
  title: string;
  date: DateStr;
  kind: 'test' | 'exam' | 'deadline';
}

export interface AppData {
  main: MainSchedule;
  src: ScheduleSources;
  homework: HomeworkItem[];
  events: EventItem[];
  /** Превью дизайна на примерных данных. */
  demo: boolean;
}

export type Layout = 'phone' | 'tablet' | 'wide';

export interface AppActions {
  /** Карточка предмета: на телефоне шторкой, на широком планшете — в правой колонке. */
  openSubject(id: string): void;
  /** Шторка «+». */
  openPlus(): void;
}

export const AppDataContext = createContext<AppData>(null as unknown as AppData);
export const ActionsContext = createContext<AppActions>({ openSubject: () => undefined, openPlus: () => undefined });
export const LayoutContext = createContext<Layout>('phone');

export const useAppData = () => useContext(AppDataContext);
export const useActions = () => useContext(ActionsContext);
export const useLayout = () => useContext(LayoutContext);

/** Как выглядит предмет с учётом настроек (цвет, иконка, сокращение). */
export function useSubject(id: string): SubjectView {
  const { main } = useAppData();
  const settings = useSettings();
  return subjectView(id, main, settings);
}

/** Невыполненные ДЗ — для красного счётчика на вкладке. */
export function pendingHomework(data: AppData): number {
  return data.homework.filter((h) => !h.done).length;
}
