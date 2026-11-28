import { DatePicker } from '../ui/DatePicker';
import { useMemo, useRef, useState } from 'preact/hooks';
import { addDays, isValidDate, toMinutes } from '../core/time';
import { activeLessons, findNextLessonOfSubject, resolveDay } from '../core/schedule';
import { useAppData, type HomeworkItem } from '../shell/app';
import { useClock } from '../shell/clock';
import { PlannerConflict, usePlanner, type StudyNote } from '../state/planner';
import { Button } from '../ui/controls';
import { dismissSheet, openSheet, showToast } from '../ui/overlays';
import './study.css';

type Entry = { subjectId?: string } & (
  | { kind: 'homework'; item?: HomeworkItem }
  | { kind: 'note'; item?: StudyNote }
);

export function openStudyEditor(entry: Entry) {
  const title = entry.item ? (entry.kind === 'homework' ? 'Редактировать ДЗ' : 'Редактировать заметку')
    : entry.kind === 'homework' ? 'Записать ДЗ' : 'Новая заметка';
  const id = openSheet({ title, content: () => <StudyEditor entry={entry} close={() => dismissSheet(id)} /> });
}

export function StudyActions({ subjectId }: { subjectId?: string }) {
  return (
    <div class="study-actions">
      <Button icon="check-square" variant="tinted" onClick={() => openStudyEditor({ kind: 'homework', subjectId })}>Записать ДЗ</Button>
      <Button icon="pencil-simple" variant="gray" onClick={() => openStudyEditor({ kind: 'note', subjectId })}>Заметка</Button>
    </div>
  );
}

export function exportNote(note: StudyNote, subject?: string) {
  const fileTitle = note.text.trim().split('\n')[0].replace(/[<>:"/\\|?*#[\]^]/g, ' ').trim().slice(0, 70) || 'Заметка';
  const metadata = ['---', `date: ${note.date}`, subject && `subject: ${JSON.stringify(subject)}`, '---', ''].filter(v => typeof v === 'string');
  const blob = new Blob([metadata.join('\n'), '\n', note.text, '\n'], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${note.date} — ${fileTitle}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StudyEditor({ entry, close }: { entry: Entry; close: () => void }) {
  const { main, src } = useAppData();
  const [, update, add] = usePlanner();
  const clock = useClock('minute');
  const isTask = entry.kind === 'homework';
  const task = entry.kind === 'homework' ? entry.item : undefined;
  const note = entry.kind === 'note' ? entry.item : undefined;
  const [id] = useState(() => entry.item?.id ?? crypto.randomUUID());
  const [subject, setSubject] = useState(() => {
    if (entry.item) return entry.item.subjectId;
    if (entry.subjectId) return entry.subjectId;
    const lessons = activeLessons(resolveDay(clock.date, src));
    const latest = lessons.filter(l => toMinutes(l.start) <= clock.minutes).pop();
    return latest?.subjectId ?? lessons[0]?.subjectId ?? (isTask ? main.subjects[0]?.id ?? '' : '');
  });
  const nextClass = useMemo(() => isTask ? findNextLessonOfSubject(subject, clock.date, src) : null, [subject, clock.date, src, isTask]);
  const [customDue, setCustomDue] = useState<string | null>(task?.due ?? null);
  const due = customDue ?? nextClass?.date ?? addDays(clock.date, 1);
  const [text, setText] = useState(task?.title ?? note?.text ?? '');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const valid = Boolean(text.trim()) && (!isTask || (subject && isValidDate(due)));
  const subjectName = main.subjects.find(s => s.id === subject)?.full;

  const save = async () => {
    if (!valid || locked.current) return;
    locked.current = true;
    setBusy(true);
    const value = isTask ? text.trim() : text;
    let ok: boolean;
    if (isTask) {
      const item: HomeworkItem = { id, title: value, subjectId: subject, due, done: false };
      ok = task ? await update(current => {
        const previous = current.homework.find(h => h.id === id);
        if (!previous || previous.title !== task.title || previous.due !== task.due || previous.subjectId !== task.subjectId)
          throw new PlannerConflict('Задание изменилось в другой вкладке. Открой его заново.');
        return { ...current, homework: current.homework.map(h => h.id === id ? { ...h, title: value, subjectId: subject, due } : h) };
      }) : await add({ kind: 'homework', item });
    } else {
      const item: StudyNote = { id, text: value, subjectId: subject, date: note?.date ?? clock.date, updatedAt: Date.now() };
      ok = note ? await update(current => {
        if (current.notes.find(n => n.id === id)?.updatedAt !== note.updatedAt)
          throw new PlannerConflict('Заметка изменилась в другой вкладке. Открой её заново.');
        return { ...current, notes: [item, ...current.notes.filter(n => n.id !== id)] };
      }) : await add({ kind: 'note', item });
    }
    if (ok) {
      close();
      showToast({ text: isTask ? 'ДЗ сохранено' : 'Заметка сохранена', icon: 'check' });
    } else {
      setBusy(false);
      locked.current = false;
    }
  };

  const removeNote = async () => {
    if (!note || locked.current) return;
    locked.current = true;
    setBusy(true);
    const ok = await update(current => {
      if (current.notes.find(n => n.id === note.id)?.updatedAt !== note.updatedAt) throw new PlannerConflict('Заметка уже изменилась. Открой её заново.');
      return { ...current, notes: current.notes.filter(n => n.id !== note.id) };
    });
    if (!ok) { locked.current = false; setBusy(false); return; }
    close();
    showToast({ text: 'Заметка удалена', icon: 'trash', actionLabel: 'Вернуть',
      onAction: () => void update(s => s.notes.some(n => n.id === note.id) ? s : { ...s, notes: [note, ...s.notes] }) });
  };

  return (
    <form class="study-editor" onSubmit={e => { e.preventDefault(); void save(); }}
      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } }}>
      <label class="study-field">
        <span>Предмет</span>
        <select value={subject} onChange={e => setSubject(e.currentTarget.value)}>
          {!isTask && <option value="">Общая заметка</option>}
          {main.subjects.map(s => <option key={s.id} value={s.id}>{s.short} · {s.full}</option>)}
        </select>
      </label>
      <label class="study-field">
        <span>{isTask ? 'Что задали' : 'Текст заметки'}</span>
        <textarea required rows={isTask ? 3 : 7} value={text}
          placeholder={isTask ? 'Например, построить разрез детали' : 'Что стоит запомнить с пары?'}
          onInput={e => setText(e.currentTarget.value)} />
      </label>
      {isTask && (
        <div class="study-date">
          <div class="study-field"><span>Срок сдачи</span>
            <DatePicker label="Срок сдачи" value={due} today={clock.date} onChange={setCustomDue}/>
          </div>
          <button type="button" class="study-date__next" onClick={() => setCustomDue(null)}>{nextClass ? 'К следующей паре' : 'На завтра'}</button>
        </div>
      )}
      <Button type="submit" disabled={!valid || busy} block size="lg">{busy ? 'Сохранение…' : 'Сохранить'}</Button>
      {note && <div class="study-editor__tools">
        <Button type="button" variant="plain" icon="arrow-square-out" disabled={!text.trim()} onClick={() => exportNote({ ...note, text, subjectId: subject }, subjectName)}>Скачать .md</Button>
        <Button type="button" variant="plain" class="study-delete" disabled={busy} onClick={removeNote}>Удалить</Button>
      </div>}
    </form>
  );
}
