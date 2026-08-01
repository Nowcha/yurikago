import type { CareRecord } from '../types';

export interface CareDaySummary {
  feedingCount: number;
  formulaMl: number;
  peeCount: number;
  poopCount: number;
}

/** 計測値・量は有限の正数だけを受け付ける */
export function parsePositiveMeasurement(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** 医療的な評価をせず、日次ログの事実だけを集計する */
export function summarizeCareDay(records: CareRecord[]): CareDaySummary {
  return records.reduce<CareDaySummary>((summary, record) => {
    const formulaMl = record.type === 'formula'
      && record.amountMl != null
      && Number.isFinite(record.amountMl)
      && record.amountMl > 0
      ? record.amountMl
      : 0;
    return {
      feedingCount: summary.feedingCount
        + (record.type === 'breast_l' || record.type === 'breast_r' || record.type === 'formula' ? 1 : 0),
      formulaMl: summary.formulaMl + formulaMl,
      peeCount: summary.peeCount + (record.type === 'pee' ? 1 : 0),
      poopCount: summary.poopCount + (record.type === 'poop' ? 1 : 0),
    };
  }, {
    feedingCount: 0,
    formulaMl: 0,
    peeCount: 0,
    poopCount: 0,
  });
}
