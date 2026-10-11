// Карточка на «Сегодня»: скоро государственный праздник, а по расписанию в этот день пары — отметить выходным?

import { describeHoliday, holidayMarkOverride, type Holiday } from '../../core/holidays';
import { formatDayMonth } from '../../core/format';
import type { DateStr } from '../../core/time';
import { newStamp, saveOverrides } from '../../state/changes';
import { dismissHoliday, updateSettings } from '../../state/settings';
import { Button } from '../../ui/controls';
import { IconTile } from '../../ui/List';
import { notifyChange } from '../changes/api';
import { holidayDateLabel } from './todayLogic';

export function HolidayCard({ holiday, today }: { holiday: Holiday; today: DateStr }) {
  const titleId = `holiday-${holiday.date}`;

  const mark = () => {
    const undo = saveOverrides([holidayMarkOverride(holiday, newStamp())]);
    notifyChange(`${formatDayMonth(holiday.date)} — выходной`, undo);
  };

  // «Не сейчас» прячет карточку только для этого праздника; отметить его можно и потом, в настройках.
  const later = () => {
    dismissHoliday(holiday.date);
    notifyChange('Отметить можно в настройках', () =>
      updateSettings((s) => ({ dismissedHolidays: s.dismissedHolidays.filter((d) => d !== holiday.date) })),
    );
  };

  return (
    <section class="holiday-card" aria-labelledby={titleId}>
      <div class="holiday-card__top">
        <IconTile name="confetti" color="orange" />
        <div class="holiday-card__text">
          {/* Дата отдельной строкой сверху, название — заголовком: «4 ноября, среда» / «День народного единства» */}
          <h2 id={titleId} class="holiday-card__title" aria-label={describeHoliday(holiday)}>
            <span class="t-footnote t-upper holiday-card__date">{holidayDateLabel(holiday.date, today)}</span>
            <span class="t-headline">{holiday.name}</span>
          </h2>
          <p class="t-subhead t-secondary">Пар, скорее всего, не будет. Отметить выходным?</p>
        </div>
      </div>
      <div class="holiday-card__actions">
        <Button variant="filled" onClick={mark}>
          Отметить
        </Button>
        <Button variant="gray" onClick={later}>
          Не сейчас
        </Button>
      </div>
    </section>
  );
}
