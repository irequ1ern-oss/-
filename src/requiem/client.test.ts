import { expect, it } from 'vitest';
import { hm } from './client';

it('labels the previous day for an early departure and the next day at the destination', () => {
  expect(hm(-5)).toBe('23:55 -1');
  expect(hm(0)).toBe('00:00');
  expect(hm(1512)).toBe('01:12 +1');
  expect(hm(null)).toBe('—');
});
