import type { CareRecord } from '../types';
import { positiveValue } from './records';

/**
 * 直接母乳は量を測れないため、授乳時間(分)から推定する。
 * 既定値は仮の値で、世帯ごとに実測に合わせて調整する前提。医療的な基準ではない。
 */
export const DEFAULT_BREAST_ML_PER_MIN = 3;

export interface FeedingVolume {
  /** 授乳時間×1分あたりの推定量。授乳時間が未入力の記録は0として扱う */
  breastMl: number;
  formulaMl: number;
  expressedMl: number;
  totalMl: number;
}

export interface DayVolume extends FeedingVolume {
  day: string;
}

export function resolveBreastMlPerMin(value: number | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : DEFAULT_BREAST_ML_PER_MIN;
}

/** 母乳（推定）・ミルク・搾母乳の量と合計。搾乳（pump）は飲ませていないので含めない */
export function summarizeFeedingVolume(
  records: CareRecord[],
  breastMlPerMin: number = DEFAULT_BREAST_ML_PER_MIN,
): FeedingVolume {
  let breastMinutes = 0;
  let formulaMl = 0;
  let expressedMl = 0;
  for (const record of records) {
    if (record.type === 'breast_l' || record.type === 'breast_r') {
      breastMinutes += positiveValue(record.durationMin);
    } else if (record.type === 'formula') {
      formulaMl += positiveValue(record.amountMl);
    } else if (record.type === 'expressed') {
      expressedMl += positiveValue(record.amountMl);
    }
  }
  const breastMl = Math.round(breastMinutes * breastMlPerMin);
  return { breastMl, formulaMl, expressedMl, totalMl: breastMl + formulaMl + expressedMl };
}

/** 日ごとの量。windows は日の境界（ローカル0時）を表す */
export function buildDailyVolumes(
  records: CareRecord[],
  windows: { day: string; startAt: number; endAt: number }[],
  breastMlPerMin: number = DEFAULT_BREAST_ML_PER_MIN,
): DayVolume[] {
  return windows.map(({ day, startAt, endAt }) => ({
    day,
    ...summarizeFeedingVolume(
      records.filter((record) => record.at >= startAt && record.at < endAt),
      breastMlPerMin,
    ),
  }));
}
