import { describe, expect, it } from 'vitest';
import {
  buildDailyVolumes, resolveBreastMlPerMin, summarizeFeedingVolume, DEFAULT_BREAST_ML_PER_MIN,
} from '../src/lib/feedingVolume';
import type { CareRecord } from '../src/types';

const records: CareRecord[] = [
  { id: '1', type: 'breast_l', at: 100, durationMin: 10 },
  { id: '2', type: 'breast_r', at: 200, durationMin: 5 },
  { id: '3', type: 'breast_l', at: 250 }, // 授乳時間なし → 0
  { id: '4', type: 'formula', at: 300, amountMl: 80 },
  { id: '5', type: 'expressed', at: 400, amountMl: 50 },
  { id: '6', type: 'pump', at: 500, amountMl: 120 }, // 搾っただけ → 含めない
  { id: '7', type: 'formula', at: 600, amountMl: -10 }, // 不正値は0
];

describe('summarizeFeedingVolume', () => {
  it('母乳は授乳時間×係数で推定し、ミルク・搾母乳と合計する', () => {
    expect(summarizeFeedingVolume(records, 2)).toEqual({
      breastMl: 30, formulaMl: 80, expressedMl: 50, totalMl: 160,
    });
  });

  it('係数を省略すると既定値を使う', () => {
    expect(summarizeFeedingVolume(records).breastMl).toBe(15 * DEFAULT_BREAST_ML_PER_MIN);
  });

  it('記録が無ければすべて0', () => {
    expect(summarizeFeedingVolume([])).toEqual({
      breastMl: 0, formulaMl: 0, expressedMl: 0, totalMl: 0,
    });
  });
});

describe('buildDailyVolumes', () => {
  it('日の窓ごとに集計する（終端は含まない）', () => {
    const windows = [
      { day: 'd1', startAt: 0, endAt: 300 },
      { day: 'd2', startAt: 300, endAt: 1000 },
    ];
    const result = buildDailyVolumes(records, windows, 2);
    expect(result[0]).toEqual({ day: 'd1', breastMl: 30, formulaMl: 0, expressedMl: 0, totalMl: 30 });
    expect(result[1]).toEqual({ day: 'd2', breastMl: 0, formulaMl: 80, expressedMl: 50, totalMl: 130 });
  });
});

describe('resolveBreastMlPerMin', () => {
  it('未設定・不正値は既定値、正の値はそのまま', () => {
    expect(resolveBreastMlPerMin(undefined)).toBe(DEFAULT_BREAST_ML_PER_MIN);
    expect(resolveBreastMlPerMin(0)).toBe(DEFAULT_BREAST_ML_PER_MIN);
    expect(resolveBreastMlPerMin(Number.NaN)).toBe(DEFAULT_BREAST_ML_PER_MIN);
    expect(resolveBreastMlPerMin(4.5)).toBe(4.5);
  });
});
