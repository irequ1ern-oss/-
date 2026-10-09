import { describe, expect, it } from 'vitest';
import { ringArc, ringRadii, ringsLabel } from './ActivityRings';

describe('ActivityRings', () => {
  it('радиусы колец снаружи внутрь с промежутком', () => {
    expect(ringRadii(120, 14, 2)).toEqual([53, 36]);
    expect(ringRadii(100, 10, 3)).toEqual([45, 32, 19]);
  });

  it('ringArc: доля и второй круг', () => {
    expect(ringArc(0)).toEqual({ fraction: 0, lapped: false });
    expect(ringArc(0.4)).toEqual({ fraction: 0.4, lapped: false });
    expect(ringArc(1)).toEqual({ fraction: 1, lapped: false });
    expect(ringArc(1.25)).toEqual({ fraction: 0.25, lapped: true });
    expect(ringArc(2)).toEqual({ fraction: 1, lapped: true });
    expect(ringArc(-1)).toEqual({ fraction: 0, lapped: false });
    expect(ringArc(Number.NaN)).toEqual({ fraction: 0, lapped: false });
  });

  it('подпись для диктора', () => {
    expect(
      ringsLabel([
        { value: 5 / 7, color: 'var(--accent)', label: 'Сделано', caption: '5 из 7' },
        { value: 0.5, color: 'var(--success)', label: 'Вовремя' },
      ]),
    ).toBe('Сделано: 5 из 7; Вовремя: 50%');
  });
});
