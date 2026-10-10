import { describe, expect, it } from 'vitest';
import {
  PHONE_SIZE, TABLET_LANDSCAPE, TABLET_PORTRAIT, appUrl, fitScale, frameMaxHeight, routeHash, splitColumns,
} from './galleryLogic';

describe('fitScale', () => {
  it('уменьшает по ширине', () => {
    expect(fitScale(PHONE_SIZE, 206)).toBeCloseTo(0.5);
    expect(fitScale(TABLET_LANDSCAPE, 670)).toBeCloseTo(0.5);
  });

  it('не увеличивает больше настоящего размера', () => {
    expect(fitScale(PHONE_SIZE, 2000)).toBe(1);
    expect(fitScale(PHONE_SIZE, 2000, 5000)).toBe(1);
  });

  it('учитывает высоту, если она теснее ширины', () => {
    expect(fitScale(TABLET_PORTRAIT, 840, 670)).toBeCloseTo(0.5);
    expect(fitScale(PHONE_SIZE, 380, 10_000)).toBeCloseTo(380 / 412);
  });

  it('ноль, пока размер контейнера неизвестен', () => {
    expect(fitScale(PHONE_SIZE, 0)).toBe(0);
    expect(fitScale(PHONE_SIZE, Number.NaN)).toBe(0);
    expect(fitScale(PHONE_SIZE, 300, 0)).toBe(0);
  });
});

describe('frameMaxHeight', () => {
  it('экран минус запас, но не меньше минимума', () => {
    expect(frameMaxHeight(915, 136)).toBe(779);
    expect(frameMaxHeight(400, 136)).toBe(360);
    expect(frameMaxHeight(400, 136, 200)).toBe(264);
  });
});

describe('routeHash', () => {
  it('пропускает адреса экранов', () => {
    expect(routeHash('#/week')).toBe('#/week');
    expect(routeHash('#/settings/subjects/mdk0401')).toBe('#/settings/subjects/mdk0401');
  });

  it('отбрасывает прочее', () => {
    expect(routeHash('')).toBe('');
    expect(routeHash(null)).toBe('');
    expect(routeHash('#phone')).toBe('');
    expect(routeHash('#/week"><script>')).toBe('');
  });
});

describe('appUrl', () => {
  it('собирает адрес с состоянием, темой и экраном', () => {
    expect(appUrl('/preview/app.html', { state: 'break', theme: 'dark' })).toBe('/preview/app.html?state=break&theme=dark');
    expect(appUrl('/-/preview/app.html', { state: 'lesson', theme: 'amoled', hash: '#/week' })).toBe(
      '/-/preview/app.html?state=lesson&theme=amoled#/week',
    );
  });

  it('не переносит посторонние якоря', () => {
    expect(appUrl('app.html', { state: 'dayoff', theme: 'auto', hash: '#tablet' })).toBe('app.html?state=dayoff&theme=auto');
  });
});

describe('splitColumns', () => {
  it('делит по порядку, первые столбцы длиннее', () => {
    expect(splitColumns([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]]);
    expect(splitColumns([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('один столбец и пустой список', () => {
    expect(splitColumns([1, 2], 1)).toEqual([[1, 2]]);
    expect(splitColumns([], 2)).toEqual([[]]);
    expect(splitColumns([1], 3)).toEqual([[1]]);
  });
});
