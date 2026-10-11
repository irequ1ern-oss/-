// Шторка «+»: что можно создать. Пункты будущих этапов видны, но пока неактивны.

import { useRef } from 'preact/hooks';
import { Cell, Group, IconTile } from '../ui/List';
import { dismissSheet, useOverlayState } from '../ui/overlays';
import { openNewChangeChooser } from './changes/api';

const SOON = [
  { icon: 'check-square', color: 'indigo', title: 'ДЗ', subtitle: 'Задание к паре со сроком', stage: 'этап 3' },
  { icon: 'note', color: 'yellow', title: 'Заметка', subtitle: 'Конспект или мысль с пары', stage: 'этап 3' },
] as const;

export function PlusSheet() {
  // Своя шторка — верхняя в момент открытия (запоминаем сразу: потом сверху может оказаться другая).
  const { sheets } = useOverlayState();
  const self = useRef(sheets[sheets.length - 1]?.id);

  // Шторка «+» уезжает, а на её месте открывается выбор изменения (день, выходной, практика…).
  const openChanges = () => {
    if (self.current !== undefined) dismissSheet(self.current);
    openNewChangeChooser();
  };

  return (
    <Group footer="ДЗ и заметки появятся на этапе 3.">
      <Cell
        icon={<IconTile name="swap" color="orange" />}
        title="Изменение расписания"
        subtitle="Замена, отмена, выходной, практика"
        accessory="chevron"
        onClick={openChanges}
      />
      {SOON.map((it) => (
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
  );
}
