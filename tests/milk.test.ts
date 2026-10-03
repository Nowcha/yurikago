import { describe, expect, it } from 'vitest';
import { calcMilkPlan, findWeightAsOf } from '../src/lib/milk';
import type { CareRecord } from '../src/types';

describe('calcMilkPlan', () => {
  it('3.0kgなら1日450-600ml、8回で1回56-75ml', () => {
    expect(calcMilkPlan(3)).toEqual({
      dailyMinMl: 450, dailyMaxMl: 600, perFeedMinMl: 56, perFeedMaxMl: 75,
    });
  });

  it('回数を変えると1回量だけが変わる', () => {
    const plan = calcMilkPlan(4, 6);
    expect(plan).toEqual({
      dailyMinMl: 600, dailyMaxMl: 800, perFeedMinMl: 100, perFeedMaxMl: 133,
    });
  });

  it('不正な体重・回数は null', () => {
    expect(calcMilkPlan(0)).toBeNull();
    expect(calcMilkPlan(-1)).toBeNull();
    expect(calcMilkPlan(Number.NaN)).toBeNull();
    expect(calcMilkPlan(Infinity)).toBeNull();
    expect(calcMilkPlan(3, 0)).toBeNull();
  });
});

describe('findWeightAsOf', () => {
  const records: CareRecord[] = [
    { id: 'a', type: 'weight', at: 100, weightG: 3000 },
    { id: 'b', type: 'weight', at: 300, weightG: 3200 },
    { id: 'c', type: 'weight', at: 500, weightG: 3400 },
    { id: 'm', type: 'memo', at: 900, weightG: 9999 },
    { id: 'x', type: 'weight', at: 400, weightG: -1 },
  ];

  it('その時点より前で一番新しい体重を返す（並び順に依存しない）', () => {
    expect(findWeightAsOf(records, 1000)).toEqual({ weightG: 3400, at: 500 });
    expect(findWeightAsOf([...records].reverse(), 1000)).toEqual({ weightG: 3400, at: 500 });
  });

  it('その日に記録が無ければ前日以前の体重を引き継ぐ', () => {
    expect(findWeightAsOf(records, 450)).toEqual({ weightG: 3200, at: 300 });
  });

  it('境界は含まず、不正値や体重以外は無視し、無ければ null', () => {
    expect(findWeightAsOf(records, 500)).toEqual({ weightG: 3200, at: 300 });
    expect(findWeightAsOf(records, 100)).toBeNull();
    expect(findWeightAsOf([], 1000)).toBeNull();
  });
});
