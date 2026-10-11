// Плашка изменений дня над парами («Сегодня», «Неделя»): «Временное расписание до 17.10» или «Изменения на этот день».
// Нажатие открывает правку этого дня.

import type { ResolvedDay } from '../../core/schedule';
import { useSettings } from '../../state/settings';
import { subjectView } from '../../state/subjects';
import { useAppData } from '../../shell/app';
import { Icon } from '../../ui/Icon';
import { openDayEditor } from '../changes/api';
import { changesBannerText } from './weekLogic';
import './ChangesBanner.css';

interface Props {
  day: ResolvedDay;
  /** Показывать ли под заголовком, что именно изменилось (на «Сегодня» в выходной это уже сказано в главном блоке). */
  details?: boolean;
}

export function ChangesBanner({ day, details = true }: Props) {
  const { main, src } = useAppData();
  const settings = useSettings();
  const text = changesBannerText(day, (id) => subjectView(id, main, settings).short, src);
  if (!text) return null;
  const subtitle = details ? text.subtitle : undefined;
  return (
    <button
      class="changes-banner pressable"
      onClick={() => openDayEditor(day.date)}
      aria-label={`${text.title}${subtitle ? `. ${subtitle}` : ''}. Изменить день`}
    >
      <Icon name="swap" size={20} weight="fill" class="changes-banner__icon" />
      <span class="changes-banner__text">
        <span class="t-subhead changes-banner__title">{text.title}</span>
        {subtitle && <span class="t-footnote changes-banner__sub">{subtitle}</span>}
      </span>
      <Icon name="caret-right" size={16} class="changes-banner__chevron" />
    </button>
  );
}
