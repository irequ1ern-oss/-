import { Files } from './Resources';
import { useState } from 'preact/hooks';
import {
  api,
  labels,
  titles,
  words,
  type Desk,
  type Entry,
  type Fields,
  type Value,
} from './client';

export function Editor({
  desk,
  kind,
  entry,
  initial,
  closed,
  saved,
}: {
  desk: Desk;
  kind: string;
  entry?: Entry;
  initial?: Fields;
  closed: () => void;
  saved: () => Promise<void>;
}) {
  const schema = desk.schemas[kind];
  const [data, set] = useState<Fields>(() =>
    Object.fromEntries(
      Object.entries(schema.properties).map(([k, p]) => [
        k,
        entry?.data[k] ??
          initial?.[k] ??
          (p.anyOf?.some((x) => x.type === 'null')
            ? null
            : (p.default ??
              (p.format === 'date'
                ? desk.date
                : (p.enum?.[0] ?? (p.type === 'boolean' ? false : ''))))),
      ]),
    ),
  );
  const [error, fail] = useState(''),
    [busy, working] = useState(false);
  const setField = (k: string, v: Value) => set((d) => ({ ...d, [k]: v }));
  async function submit() {
    working(true);
    fail('');
    const single = ['travel', 'layout', 'chat_settings', 'workshop'].includes(
      kind,
    );
    const id =
      entry?.id ??
      (single
        ? 'default'
        : kind === 'subject'
          ? String(data.subject)
          : crypto.randomUUID());
    const prior =
      entry ?? desk.records.find((r) => r.id === id && r.kind === kind);
    try {
      await api('changes', {
        changes: [{ kind, id, version: prior?.version ?? 0, data }],
      });
      await saved();
      closed();
    } catch (e) {
      fail(String((e as Error).message));
    } finally {
      working(false);
    }
  }
  return (
    <dialog
      class="rq-modal"
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      onCancel={closed}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header>
          <h2>{titles[kind]}</h2>
          <button type="button" onClick={closed} aria-label="Закрыть">
            ×
          </button>
        </header>
        {Object.entries(schema.properties)
          .filter(
            ([k]) => kind !== 'decision' || ['actual', 'note'].includes(k),
          )
          .map(([k, p]) => {
            const spec = p.anyOf?.find((x) => x.type !== 'null') ?? p;
            const val = data[k],
              required = schema.required?.includes(k),
              label = labels[k] ?? k;
            const opts =
              k === 'subject'
                ? Object.keys(desk.subjects)
                : k === 'depends'
                  ? desk.records
                      .filter((r) => r.kind === 'task' && r.id !== entry?.id)
                      .map((r) => r.id)
                  : spec.enum;
            if (opts)
              return (
                <label key={k}>
                  {label}
                  <select
                    value={String(val ?? '')}
                    required={required}
                    onChange={(e) => setField(k, e.currentTarget.value)}
                  >
                    <option value="">Выбрать</option>
                    {opts.map((v) => (
                      <option key={v} value={v}>
                        {k === 'subject'
                          ? desk.subjects[v].full
                          : k === 'depends'
                            ? String(
                                desk.records.find((r) => r.id === v)?.data
                                  .title,
                              )
                            : (words[v] ?? v)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            if (spec.type === 'boolean')
              return (
                <label class="check" key={k}>
                  <input
                    type="checkbox"
                    checked={!!val}
                    onChange={(e) => setField(k, e.currentTarget.checked)}
                  />
                  {label}
                </label>
              );
            const numeric = ['integer', 'number'].includes(spec.type ?? '');
            if (['text', 'prompt', 'note'].includes(k))
              return (
                <label key={k}>
                  {label}
                  <textarea
                    value={String(val ?? '')}
                    required={required}
                    maxLength={spec.maxLength}
                    onInput={(e) => setField(k, e.currentTarget.value)}
                  />
                </label>
              );
            return (
              <label key={k}>
                {label}
                <input
                  type={
                    spec.format === 'date'
                      ? 'date'
                      : numeric
                        ? 'number'
                        : spec.pattern?.includes('2[0-3]')
                          ? 'time'
                          : 'text'
                  }
                  value={String(val ?? '')}
                  step={spec.type === 'number' ? 'any' : undefined}
                  min={spec.minimum}
                  max={spec.maximum}
                  required={required}
                  maxLength={spec.maxLength}
                  onInput={(e) =>
                    setField(
                      k,
                      numeric
                        ? e.currentTarget.value === ''
                          ? null
                          : Number(e.currentTarget.value)
                        : e.currentTarget.value,
                    )
                  }
                />
              </label>
            );
          })}
        {error && <p role="alert">{error}</p>}
        <button class="primary" disabled={busy}>
          Сохранить
        </button>
      </form>
      {kind === 'task' && entry && <Files task={entry.id} />}
    </dialog>
  );
}
