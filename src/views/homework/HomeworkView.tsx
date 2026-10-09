import { Screen } from '../../ui/Screen';
import { EmptyState } from '../../ui/List';

// ЗАГОТОВКА: список ДЗ со свайпами и статистика (на примерах в превью).
export function HomeworkView() {
  return (
    <Screen title="ДЗ">
      <EmptyState icon="check-square" title="Домашних заданий пока нет" text="Появятся на этапе 3" />
    </Screen>
  );
}
