// Приложение с живыми данными: основное расписание + изменения из хранилища (src/state/changes.ts).
// Любое изменение (своё, отмена, из другого окна) сразу перерисовывает экраны.

import { useMemo } from 'preact/hooks';
import type { MainSchedule } from '../core/schedule';
import { useChanges } from '../state/changes';
import { withUserSubjects } from '../state/subjects';
import { AppShell } from './AppShell';
import type { AppData, Layout } from './app';
import type { ClockSource } from './clock';

interface Props {
  /** Всё, кроме расписания с изменениями: его AppRoot собирает сам. */
  base: Omit<AppData, 'main' | 'src'> & { main: MainSchedule };
  clock: ClockSource;
  forceLayout?: Layout;
}

export function AppRoot({ base, clock, forceLayout }: Props) {
  const changes = useChanges();
  const data = useMemo<AppData>(() => {
    const main = withUserSubjects(base.main, changes.subjects);
    return { ...base, main, src: { main, periods: changes.periods, overrides: changes.overrides } };
  }, [base, changes]);
  return <AppShell data={data} clock={clock} forceLayout={forceLayout} />;
}
