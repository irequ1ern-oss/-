type Plan = {
  minutes: number;
  net: number | null;
  end: number | null;
  blocked: string[];
  unknown: string[];
  reasons: string[];
};
type Event =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'error'; detail: string }
  | {
      type: 'complete';
      answer: string;
      tools: {
        name: string;
        proposal?: string;
        change?: unknown;
        plans?: Plan[];
      }[];
    };

export async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Event> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines)
        if (line.trim()) yield JSON.parse(line) as Event;
      if (done) break;
    }
    if (pending.trim()) throw Error('Сервер прервал передачу ответа');
  } finally {
    reader.releaseLock();
  }
}
