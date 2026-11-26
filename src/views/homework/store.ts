import { usePlanner } from '../../state/planner';
import type { TrackedHomework } from './stats';

export function useHomework() {
  const [planner, change] = usePlanner();
  return [planner.homework, (fn: (items: TrackedHomework[]) => TrackedHomework[]) =>
    change(current => ({ ...current, homework: fn(current.homework) }))] as const;
}
