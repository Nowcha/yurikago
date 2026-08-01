import { describe, expect, it } from 'vitest';
import { summarizeCareDay } from '../src/lib/records';
import type { CareRecord } from '../src/types';

function record(id: string, type: CareRecord['type'], amountMl?: number): CareRecord {
  return { id, type, at: 0, ...(amountMl == null ? {} : { amountMl }) };
}

describe('summarizeCareDay', () => {
  it('授乳記録・ミルク量・排泄回数を集計する', () => {
    const records = [
      record('1', 'breast_l'),
      record('2', 'breast_r'),
      record('3', 'formula', 80),
      record('4', 'formula', 60),
      record('5', 'pump', 40),
      record('6', 'pee'),
      record('7', 'pee'),
      record('8', 'poop'),
      record('9', 'sleep'),
    ];

    expect(summarizeCareDay(records)).toEqual({
      feedingCount: 4,
      formulaMl: 140,
      peeCount: 2,
      poopCount: 1,
    });
  });

  it('記録がない日はすべて0を返す', () => {
    expect(summarizeCareDay([])).toEqual({
      feedingCount: 0,
      formulaMl: 0,
      peeCount: 0,
      poopCount: 0,
    });
  });
});
