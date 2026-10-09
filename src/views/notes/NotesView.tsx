import { Screen } from '../../ui/Screen';
import { EmptyState } from '../../ui/List';

// ЗАГОТОВКА: заметки появятся на этапе 3.
export function NotesView() {
  return (
    <Screen title="Заметки">
      <EmptyState icon="notepad" title="Заметок пока нет" text="Появятся на этапе 3" />
    </Screen>
  );
}
