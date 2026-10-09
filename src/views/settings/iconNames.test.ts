import { describe, expect, it } from 'vitest';
import { SUBJECT_ICON_NAMES } from '../../ui/iconData';
import { iconTitle } from './iconNames';

describe('названия иконок', () => {
  it('у каждой иконки предмета есть русское название', () => {
    const missing = SUBJECT_ICON_NAMES.filter((n) => iconTitle(n) === n);
    expect(missing).toEqual([]);
  });
});
