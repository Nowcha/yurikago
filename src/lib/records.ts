import type { CareRecord } from '../types';

export interface CareDaySummary {
  feedingCount: number;
  breastMinutes: number;
  formulaMl: number;
  pumpMl: number;
  sleepMinutes: number;
  peeCount: number;
  poopCount: number;
}

export interface CareDayWindow {
  startAt: number;
  endAt: number;
  nowAt?: number;
}

/** 計測値・量は有限の正数だけを受け付ける */
export function parsePositiveMeasurement(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveValue(value: number | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

function summarizeSleepMinutes(records: CareRecord[], window: CareDayWindow | undefined): number {
  if (!window) return 0;
  const effectiveEnd = Math.max(
    window.startAt,
    Math.min(window.endAt, window.nowAt ?? window.endAt),
  );
  const events = records
    .filter((record) => (
      (record.type === 'sleep' || record.type === 'wake') && record.at < effectiveEnd
    ))
    .sort((left, right) => left.at - right.at);
  const lastBeforeStart = events.filter((event) => event.at < window.startAt).at(-1);
  let sleeping = lastBeforeStart?.type === 'sleep';
  let sleepStartedAt = sleeping ? window.startAt : 0;
  let totalMs = 0;

  for (const event of events) {
    if (event.at < window.startAt) continue;
    if (event.type === 'sleep' && !sleeping) {
      sleeping = true;
      sleepStartedAt = event.at;
    } else if (event.type === 'wake' && sleeping) {
      totalMs += Math.max(0, event.at - sleepStartedAt);
      sleeping = false;
    }
  }
  if (sleeping) totalMs += Math.max(0, effectiveEnd - sleepStartedAt);
  return Math.floor(totalMs / 60_000);
}

/** 医療的な評価をせず、日次ログの事実だけを集計する */
export function summarizeCareDay(
  records: CareRecord[],
  window?: CareDayWindow,
): CareDaySummary {
  const dayRecords = window
    ? records.filter((record) => record.at >= window.startAt && record.at < window.endAt)
    : records;
  const summary = dayRecords.reduce<CareDaySummary>((current, record) => {
    const formulaMl = record.type === 'formula'
      ? positiveValue(record.amountMl)
      : 0;
    const pumpMl = record.type === 'pump' ? positiveValue(record.amountMl) : 0;
    const breastMinutes = record.type === 'breast_l' || record.type === 'breast_r'
      ? positiveValue(record.durationMin)
      : 0;
    return {
      feedingCount: current.feedingCount
        + (record.type === 'breast_l' || record.type === 'breast_r' || record.type === 'formula' ? 1 : 0),
      breastMinutes: current.breastMinutes + breastMinutes,
      formulaMl: current.formulaMl + formulaMl,
      pumpMl: current.pumpMl + pumpMl,
      sleepMinutes: 0,
      peeCount: current.peeCount + (record.type === 'pee' ? 1 : 0),
      poopCount: current.poopCount + (record.type === 'poop' ? 1 : 0),
    };
  }, {
    feedingCount: 0,
    breastMinutes: 0,
    formulaMl: 0,
    pumpMl: 0,
    sleepMinutes: 0,
    peeCount: 0,
    poopCount: 0,
  });
  return { ...summary, sleepMinutes: summarizeSleepMinutes(records, window) };
}
