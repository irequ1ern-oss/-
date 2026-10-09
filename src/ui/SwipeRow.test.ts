import { describe, expect, it } from 'vitest';
import { ACTION_W, clampOffset, fullThreshold, isArmed, releaseOutcome, type SwipeGeometry } from './SwipeRow';

// Строка 400 px: слева одно действие, справа два.
const g: SwipeGeometry = { width: 400, leading: ACTION_W, trailing: 2 * ACTION_W };

describe('SwipeRow: смещение', () => {
  it('тянется в обе стороны, но не дальше ширины строки', () => {
    expect(clampOffset(50, g)).toBe(50);
    expect(clampOffset(-500, g)).toBe(-400);
    expect(clampOffset(900, g)).toBe(400);
  });

  it('в сторону без действий не тянется', () => {
    expect(clampOffset(80, { ...g, leading: 0 })).toBe(0);
    expect(clampOffset(-80, { ...g, trailing: 0 })).toBe(0);
  });
});

describe('SwipeRow: полный свайп', () => {
  it('порог — 60% ширины, но не меньше кнопок + 40 px', () => {
    expect(fullThreshold(g, 'leading')).toBe(240);
    expect(fullThreshold({ width: 200, leading: 80, trailing: 160 }, 'trailing')).toBe(200);
  });

  it('isArmed', () => {
    expect(isArmed(0, g)).toBe(false);
    expect(isArmed(239, g)).toBe(false);
    expect(isArmed(240, g)).toBe(true);
    expect(isArmed(-260, g)).toBe(true);
  });
});

describe('SwipeRow: отпускание', () => {
  it('дальше половины кнопок — открыта, меньше — закрыта', () => {
    expect(releaseOutcome(-81, 0, g)).toEqual({ kind: 'open', side: 'trailing' });
    expect(releaseOutcome(-79, 0, g)).toEqual({ kind: 'close' });
    expect(releaseOutcome(41, 0, g)).toEqual({ kind: 'open', side: 'leading' });
    expect(releaseOutcome(30, 0, g)).toEqual({ kind: 'close' });
  });

  it('за порогом — полный свайп', () => {
    expect(releaseOutcome(-300, 0, g)).toEqual({ kind: 'full', side: 'trailing' });
    expect(releaseOutcome(250, 0, g)).toEqual({ kind: 'full', side: 'leading' });
  });

  it('бросок открывает с малого смещения, бросок назад — закрывает', () => {
    expect(releaseOutcome(-20, -0.8, g)).toEqual({ kind: 'open', side: 'trailing' });
    expect(releaseOutcome(-120, 0.8, g)).toEqual({ kind: 'close' });
    expect(releaseOutcome(60, -0.5, g)).toEqual({ kind: 'close' });
  });

  it('без действий с этой стороны — закрыта', () => {
    expect(releaseOutcome(100, 0, { ...g, leading: 0 })).toEqual({ kind: 'close' });
    expect(releaseOutcome(0, 0, g)).toEqual({ kind: 'close' });
  });
});
