// Шторки «Изменить расписание» (что поменять), «Какой день?» и «Выходной день» (один день или несколько подряд).
// Строки действий те же, что вверху экрана «Изменения расписания».

import { useState } from 'preact/hooks';
import { holidayOn } from '../../core/holidays';
import { activeLessons, resolveDay, type PeriodKind } from '../../core/schedule';
import { addDays, diffDays, isValidDate, type DateStr } from '../../core/time';
import { newStamp } from '../../state/changes';
import { useAppData } from '../../shell/app';
import { useClock } from '../../shell/clock';
import { navigate } from '../../shell/nav';
import { Button, TextField } from '../../ui/controls';
import { Cell, Group, IconTile } from '../../ui/List';
import { dismissSheet, openSheet } from '../../ui/overlays';
import {
  changesPath,
  daysOffSummary,
  PICK_DAYS,
  pickDaySubtitle,
  pickDayTitle,
} from './changesText';
import { openDaySheet } from './DayEditor';
import { DateField, ErrorList } from './fields';
import { planDaysOff, schoolDaysCount } from './logic';
import { applyPlan } from './notify';

export interface ChangeActionHandlers {
  onDay: () => void;
  onDaysOff: () => void;
  onPeriod: (kind: PeriodKind) => void;
}

/** Что можно поменять: день, выходной, практика, временное расписание, каникулы. */
export function ChangeActions({ onDay, onDaysOff, onPeriod, dayTitle = 'Изменить день' }: ChangeActionHandlers & { dayTitle?: string }) {
  return (
    <>
      <Cell
        icon={<IconTile name="pencil-simple" color="blue" />}
        title={dayTitle}
        subtitle="Отмена, замена, новая пара"
        accessory="chevron"
        onClick={onDay}
      />
      <Cell
        icon={<IconTile name="calendar-x" color="red" />}
        title="Выходной день"
        subtitle="Пар нет весь день"
        accessory="chevron"
        onClick={onDaysOff}
      />
      <Cell
        icon={<IconTile name="hammer" color="brown" />}
        title="Практика"
        subtitle="Одно занятие в выбранные дни"
        accessory="chevron"
        onClick={() => onPeriod('practice')}
      />
      <Cell
        icon={<IconTile name="swap" color="orange" />}
        title="Временное расписание"
        subtitle="Своя неделя на время"
        accessory="chevron"
        onClick={() => onPeriod('custom')}
      />
      <Cell
        icon={<IconTile name="sun" color="teal" />}
        title="Каникулы"
        subtitle="Дни без пар"
        accessory="chevron"
        onClick={() => onPeriod('break')}
      />
    </>
  );
}

/** Открыть новое временное расписание в «Настройках». */
export function openNewPeriod(kind: PeriodKind) {
  navigate({ tab: 'settings', path: changesPath({ screen: 'new', kind }) });
}

/** Шторка «Изменить расписание» (из «+»). Выбор закрывает её и открывает следующий шаг. */
export function openChangeChooser(): void {
  const id = openSheet({
    title: 'Изменить расписание',
    content: () => {
      const next = (step: () => void) => () => {
        dismissSheet(id);
        step();
      };
      return (
        <div class="changes-sheet">
          <Group footer="Меняется только выбранное время — потом расписание само вернётся к основному.">
            <ChangeActions
              dayTitle="День"
              onDay={next(() => openDayPicker(openDaySheet))}
              onDaysOff={next(() => openDaysOffSheet())}
              onPeriod={(kind) => next(() => openNewPeriod(kind))()}
            />
          </Group>
        </div>
      );
    },
  });
}

// ---------- «Какой день?» ----------

/** Шторка выбора дня: ближайшая неделя и «Другая дата». onPick получает дату уже после закрытия шторки. */
export function openDayPicker(onPick: (date: DateStr) => void): void {
  const id = openSheet({
    title: 'Какой день?',
    content: () => (
      <DayPicker
        onPick={(date) => {
          dismissSheet(id);
          onPick(date);
        }}
      />
    ),
  });
}

function DayPicker({ onPick }: { onPick: (date: DateStr) => void }) {
  const { src } = useAppData();
  const { date: today } = useClock('minute');
  const [other, setOther] = useState(addDays(today, PICK_DAYS));
  const days = Array.from({ length: PICK_DAYS }, (_, i) => addDays(today, i));
  return (
    <div class="changes-sheet">
      <Group>
        {days.map((date) => {
          const day = resolveDay(date, src);
          const dayOff = day.overrides.some((o) => o.action === 'cancelDay');
          return (
            <Cell
              key={date}
              class="day-pick"
              icon={<span class="date-tile tabular" aria-hidden="true">{Number(date.slice(8))}</span>}
              title={pickDayTitle(date, today)}
              subtitle={<span class="tabular">{pickDaySubtitle(date, today, activeLessons(day), dayOff)}</span>}
              value={day.overrides.length || day.period ? <span class="chip chip--changed">изменено</span> : undefined}
              accessory="chevron"
              onClick={() => onPick(date)}
            />
          );
        })}
      </Group>
      <Group footer="Можно выбрать любой день, и прошедший тоже.">
        <Cell
          icon={<IconTile name="calendar-dots" color="gray" />}
          title="Другая дата"
          accessory={<DateField label="Другая дата" value={other} onChange={setOther} />}
        />
      </Group>
      <div class="changes-buttons">
        <Button block size="lg" variant="gray" onClick={() => onPick(other)}>
          Открыть этот день
        </Button>
      </div>
    </div>
  );
}

// ---------- «Выходной день» ----------

/** Шторка «Выходной день»: дата (или с — по), причина. */
export function openDaysOffSheet(from?: DateStr): void {
  const id = openSheet({ title: 'Выходной день', content: () => <DaysOffForm from={from} close={() => dismissSheet(id)} /> });
}

function DaysOffForm({ from: initial, close }: { from?: DateStr; close: () => void }) {
  const { src } = useAppData();
  const { date: today } = useClock('minute');
  const [from, setFrom] = useState(initial ?? today);
  const [to, setTo] = useState(initial ?? today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // «С» сдвигает «По» на столько же — длина промежутка сохраняется (как в «Календаре»).
  const changeFrom = (value: DateStr) => {
    const span = isValidDate(from) && isValidDate(to) && to >= from ? diffDays(from, to) : 0;
    setFrom(value);
    setTo(addDays(value, span));
    setError('');
  };
  const changeTo = (value: DateStr) => {
    setTo(value);
    setError('');
  };

  const single = from === to;
  const holiday = single ? holidayOn(from) : undefined;
  const count = schoolDaysCount(from, to, src);
  const summary = to < from ? '' : count ? daysOffSummary(count) : single ? 'В этот день пар и так нет.' : 'В эти дни пар и так нет.';

  const submit = () => {
    const result = planDaysOff(from, to, note, src, newStamp);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    applyPlan(result.plan);
    close();
  };

  return (
    <div class="changes-sheet">
      <ErrorList errors={error ? [error] : []} />
      <Group footer={summary || undefined}>
        <Cell title={single ? 'Дата' : 'С'} accessory={<DateField label={single ? 'Дата' : 'Дата начала'} value={from} onChange={changeFrom} />} />
        <Cell title="По" accessory={<DateField label="Дата конца" value={to} min={from} onChange={changeTo} />} />
      </Group>
      <Group footer="Причину видно на «Сегодня» вместо пар. Пары, добавленные на эти дни потом, останутся.">
        <Cell
          class="changes-field"
          title="Причина"
          accessory={
            <TextField
              label="Причина"
              value={note}
              placeholder={holiday?.name ?? 'праздник, выходной…'}
              maxLength={200}
              onInput={setNote}
            />
          }
        />
      </Group>
      <div class="changes-buttons">
        <Button block size="lg" onClick={submit}>
          {single ? 'Отметить выходным' : 'Отметить выходными'}
        </Button>
      </div>
    </div>
  );
}
