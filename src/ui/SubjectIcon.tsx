import type { SubjectColor } from '../core/colors';
import { Icon } from './Icon';
import type { IconName } from './iconData';
import './SubjectIcon.css';

interface Props {
  color: SubjectColor;
  icon: IconName;
  /** 29 — в списках, 44 — в крупных блоках, 56+ — в карточке предмета. */
  size?: number;
  class?: string;
}

/** Иконка предмета как в «Настройках» iOS: белый знак на скруглённом квадрате цвета предмета. */
export function SubjectIcon({ color, icon, size = 29, class: cls }: Props) {
  return (
    <span class={cls ? `subject-icon ${cls}` : 'subject-icon'} style={`--s:${size}px;--c:var(--sc-${color})`} aria-hidden="true">
      <Icon name={icon} weight="fill" size={Math.round(size * 0.6)} />
    </span>
  );
}
