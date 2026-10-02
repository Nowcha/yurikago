import { describe, expect, it } from 'vitest';
import { calcMilkPlan } from '../src/lib/milk';

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
