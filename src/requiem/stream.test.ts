import { it, expect } from 'vitest';
import { readEvents } from './stream';

function stream(input: string) {
  const data = new TextEncoder().encode(input);
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const byte of data) c.enqueue(Uint8Array.of(byte));
      c.close();
    },
  });
}
it('decodes Cyrillic split across transport packets', async () => {
  const events = [];
  for await (const event of readEvents(
    stream(
      '{"type":"delta","text":"Шэй"}\n{"type":"tool","name":"get_tasks"}\n',
    ),
  ))
    events.push(event);
  expect(events).toEqual([
    { type: 'delta', text: 'Шэй' },
    { type: 'tool', name: 'get_tasks' },
  ]);
});
it('rejects a truncated final frame', async () => {
  await expect(readEvents(stream('{"type":"delta"')).next()).rejects.toThrow();
});
