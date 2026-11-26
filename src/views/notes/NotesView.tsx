import { useState } from 'preact/hooks';
import { formatDayMonth } from '../../core/format';
import { useAppData } from '../../shell/app';
import { usePlanner } from '../../state/planner';
import { Button, IconButton } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { openStudyEditor } from '../StudyEditor';

export function NotesView() {
  const [{ notes }] = usePlanner();
  const { main } = useAppData();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('ru');
  const add = () => openStudyEditor({ kind: 'note' });
  const matches = notes.filter(note => {
    const subject = main.subjects.find(s => s.id === note.subjectId);
    return [note.text, subject?.full, subject?.short].join(' ').toLocaleLowerCase('ru').includes(normalized);
  });
  return (
    <Screen title="Заметки" trailing={notes.length > 0 && <IconButton icon="plus" label="Новая заметка" variant="glass" onClick={add} />}>
      {notes.length === 0 ? (
        <div class="study-empty">
          <Icon name="notepad" size={32} />
          <h2 class="t-title2">Что запомнить с пары?</h2>
          <p>Запиши формулу, вопрос преподавателю или ход решения.</p>
          <Button icon="pencil-simple" onClick={add}>Написать заметку</Button>
        </div>
      ) : (
        <>
          <input class="notes-search" type="search" aria-label="Поиск по заметкам" placeholder="Поиск по тексту или предмету" value={query} onInput={e => setQuery(e.currentTarget.value)} />
          <div class="note-list">
            {matches.map(note => {
              const [first, ...rest] = note.text.trim().split('\n');
              const subject = main.subjects.find(s => s.id === note.subjectId);
              return (
                <button class="note-preview pressable" key={note.id} onClick={() => openStudyEditor({ kind: 'note', item: note })}>
                  <span class="note-preview__meta"><span class="note-preview__subject">{subject?.short ?? 'Общая'}</span>{formatDayMonth(note.date)}</span>
                  <strong>{first}</strong>
                  {rest.length > 0 && <span class="note-preview__snippet t-subhead">{rest.join('\n')}</span>}
                </button>
              );
            })}
            {!matches.length && <p class="t-secondary">По этому запросу заметок нет.</p>}
          </div>
        </>
      )}
    </Screen>
  );
}
