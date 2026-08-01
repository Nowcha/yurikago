import type { CareRecord } from '../types';

export interface CareDaySummary {
  feedingCount: number;
  formulaMl: number;
  peeCount: number;
  poopCount: number;
}

/** 医療的な評価をせず、日次ログの事実だけを集計する */
export function summarizeCareDay(records: CareRecord[]): CareDaySummary {
  return records.reduce<CareDaySummary>((summary, record) => ({
    feedingCount: summary.feedingCount
      + (record.type === 'breast_l' || record.type === 'breast_r' || record.type === 'formula' ? 1 : 0),
    formulaMl: summary.formulaMl
      + (record.type === 'formula' ? record.amountMl ?? 0 : 0),
    peeCount: summary.peeCount + (record.type === 'pee' ? 1 : 0),
    poopCount: summary.poopCount + (record.type === 'poop' ? 1 : 0),
  }), {
    feedingCount: 0,
    formulaMl: 0,
    peeCount: 0,
    poopCount: 0,
  });
}
