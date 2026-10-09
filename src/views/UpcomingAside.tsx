import { EmptyState } from '../ui/List';

// ЗАГОТОВКА: колонка «Ближайшее» на широком планшете.
export function UpcomingAside() {
  return (
    <div class="aside-panel">
      <h2 class="t-title2">Ближайшее</h2>
      <EmptyState icon="tray" title="Пока пусто" text="Здесь появятся ДЗ и события на ближайшие дни" />
    </div>
  );
}
