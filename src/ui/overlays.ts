// Общий «слой поверх экрана»: шторки, контекстное меню, всплывающие уведомления.
// Компоненты открывают их функциями openSheet / openContextMenu / showToast, а рисует OverlayHost.

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { IconName } from './iconData';

export interface SheetSpec {
  id: number;
  /** Заголовок шторки (по центру, как в iOS). */
  title?: string;
  content: () => ComponentChildren;
  /** Подпись для экранного диктора, если нет заголовка. */
  label?: string;
}

export interface MenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  destructive?: boolean;
}

export interface ContextMenuSpec {
  /** Где на экране был элемент, на который долго нажали. */
  rect: { top: number; left: number; width: number; height: number };
  /** Копия элемента, которая «приподнимается» над размытым фоном. */
  preview: () => VNode;
  items: MenuItem[];
}

export interface ToastSpec {
  id: number;
  text: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  /** Сколько миллисекунд показывать; 0 — пока не нажмут кнопку. */
  duration: number;
}

interface OverlayState {
  sheets: SheetSpec[];
  menu: ContextMenuSpec | null;
  toasts: ToastSpec[];
}

let state: OverlayState = { sheets: [], menu: null, toasts: [] };
const listeners = new Set<(s: OverlayState) => void>();
let nextId = 1;

function set(patch: Partial<OverlayState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function useOverlayState(): OverlayState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

export function openSheet(spec: Omit<SheetSpec, 'id'>): number {
  const id = nextId++;
  set({ sheets: [...state.sheets, { ...spec, id }] });
  return id;
}

export function closeSheet(id?: number) {
  const sheets = id === undefined ? state.sheets.slice(0, -1) : state.sheets.filter((s) => s.id !== id);
  set({ sheets });
}

export function openContextMenu(spec: ContextMenuSpec) {
  set({ menu: spec });
}

export function closeContextMenu() {
  set({ menu: null });
}

export function showToast(spec: Omit<ToastSpec, 'id' | 'duration'> & { duration?: number }): number {
  const id = nextId++;
  const toast: ToastSpec = { duration: 3500, ...spec, id };
  set({ toasts: [...state.toasts.filter((t) => t.text !== toast.text), toast] });
  return id;
}

export function dismissToast(id: number) {
  set({ toasts: state.toasts.filter((t) => t.id !== id) });
}
