// Шторка «+»: что можно создать. Пункты будущих этапов видны, но пока неактивны.

import { Cell, Group, IconTile } from '../ui/List';

const ITEMS = [
  { icon: 'check-square', color: 'indigo', title: 'ДЗ', subtitle: 'Задание к паре со сроком', stage: 'этап 3' },
  { icon: 'note', color: 'yellow', title: 'Заметка', subtitle: 'Конспект или мысль с пары', stage: 'этап 3' },
  { icon: 'calendar-x', color: 'orange', title: 'Изменение расписания', subtitle: 'Замена, отмена или перенос пары', stage: 'этап 2' },
] as const;

export function PlusSheet() {
  return (
    <>
      <Group footer="Эти функции появятся на следующих этапах.">
        {ITEMS.map((it) => (
          <Cell
            key={it.title}
            icon={<IconTile name={it.icon} color={it.color} />}
            title={it.title}
            subtitle={it.subtitle}
            value={<span class="soon-chip t-footnote">{it.stage}</span>}
            disabled
            onClick={() => undefined}
          />
        ))}
      </Group>
    </>
  );
}
