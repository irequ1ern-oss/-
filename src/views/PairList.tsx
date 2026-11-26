import { useState } from 'preact/hooks';
import { groupPairs } from '../core/bells';
import { lessonsCount } from '../core/format';
import type { ResolvedDay } from '../core/schedule';
import { toMinutes, type Clock } from '../core/time';
import { lessonPhase } from '../core/today';
import { Icon } from '../ui/Icon';
import { Group } from '../ui/List';
import { LessonRow } from './LessonRow';
import { MondayTalk } from './MondayTalk';

export function PairList({ day, clock, title, foldPast = false }: {
  day: ResolvedDay; clock: Clock; title?: string; foldPast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pairs = groupPairs(day.lessons);
  const past = day.date === clock.date ? pairs.filter(p => toMinutes(p.end) <= clock.minutes).length : 0;
  const hidden = foldPast && !expanded && past >= 2 ? past : 0;
  return (
    <Group header={title} class="pair-list">
      <MondayTalk date={day.date} />
      {hidden > 0 && (
        <button class="pair-list__past" onClick={() => setExpanded(true)}>
          <Icon name="check-circle" size={18} />{lessonsCount(hidden)} позади<Icon name="caret-down" size={16} />
        </button>
      )}
      {pairs.slice(hidden).map((p, i) => (
        <div key={p.start} class="pair-block">
          <div class="pair-block__rail tabular">
            <strong>{p.slot?.number ?? i + hidden + 1} пара</strong>
            <span>{p.start}</span><span>{p.end}</span>
          </div>
          <div class="pair-block__subjects">
            {p.lessons.map((lesson, j) => {
              const phase = lessonPhase(lesson, clock);
              const full = p.slot && lesson.start === p.slot.start && lesson.end === p.slot.end ? p.slot : undefined;
              const pause = full && phase === 'current' && clock.minutes >= toMinutes(full.pause) && clock.minutes < toMinutes(full.resume);
              return <LessonRow key={lesson.start + j} lesson={lesson} phase={phase}
                detail={full ? `Перемена ${full.pause}–${full.resume}` : undefined}
                onBreak={Boolean(pause)} />;
            })}
          </div>
        </div>
      ))}
    </Group>
  );
}
