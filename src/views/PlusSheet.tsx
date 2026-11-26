import { Cell, Group, IconTile } from '../ui/List';
import { closeSheet } from '../ui/overlays';
import { openStudyEditor } from './StudyEditor';

export function PlusSheet() {
  const choose = (kind: 'homework' | 'note') => {
    closeSheet();
    openStudyEditor({ kind });
  };
  return (
    <Group>
      <Cell icon={<IconTile name="check-square" color="indigo" />} title="Домашнее задание"
        subtitle="Срок к следующей паре или на свою дату" accessory="chevron" onClick={() => choose('homework')} />
      <Cell icon={<IconTile name="note" color="orange" />} title="Заметка"
        subtitle="Запись с пары или общий конспект" accessory="chevron" onClick={() => choose('note')} />
    </Group>
  );
}
