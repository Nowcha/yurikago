import type { CareRecord, CareRecordType } from '../types';

/**
 * 赤ちゃんに実際に飲ませた記録。搾乳（pump）は搾っただけで飲ませていないので含めない。
 * 「前回の授乳から」の起点と授乳回数の両方がこの定義に従う。
 */
export const FEEDING_TYPES: readonly CareRecordType[] = ['breast_l', 'breast_r', 'formula', 'expressed'];

/** 直近の授乳記録（記録の並び順に依存せず、時刻が最大のもの） */
export function findLastFeeding(records: CareRecord[]): CareRecord | undefined {
  return records.reduce<CareRecord | undefined>(
    (latest, record) => (
      FEEDING_TYPES.includes(record.type) && (!latest || record.at > latest.at) ? record : latest
    ),
    undefined,
  );
}

export interface CareDaySummary {
  feedingCount: number;
  breastMinutes: number;
  formulaMl: number;
  expressedMl: number;
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

export interface SleepInterval {
  startAt: number;
  endAt: number;
}

/** 睡眠記録（sleep/wake）を、窓内に収まる睡眠区間へ変換する。窓の外から続く睡眠・進行中の睡眠も含む */
export function buildSleepIntervals(
  records: CareRecord[],
  window: CareDayWindow | undefined,
): SleepInterval[] {
  if (!window) return [];
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
  const intervals: SleepInterval[] = [];

  for (const event of events) {
    if (event.at < window.startAt) continue;
    if (event.type === 'sleep' && !sleeping) {
      sleeping = true;
      sleepStartedAt = event.at;
    } else if (event.type === 'wake' && sleeping) {
      intervals.push({ startAt: sleepStartedAt, endAt: Math.max(sleepStartedAt, event.at) });
      sleeping = false;
    }
  }
  if (sleeping) intervals.push({ startAt: sleepStartedAt, endAt: Math.max(sleepStartedAt, effectiveEnd) });
  return intervals;
}

function summarizeSleepMinutes(records: CareRecord[], window: CareDayWindow | undefined): number {
  const totalMs = buildSleepIntervals(records, window)
    .reduce((sum, interval) => sum + (interval.endAt - interval.startAt), 0);
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
    const expressedMl = record.type === 'expressed' ? positiveValue(record.amountMl) : 0;
    const pumpMl = record.type === 'pump' ? positiveValue(record.amountMl) : 0;
    const breastMinutes = record.type === 'breast_l' || record.type === 'breast_r'
      ? positiveValue(record.durationMin)
      : 0;
    return {
      feedingCount: current.feedingCount
        + (FEEDING_TYPES.includes(record.type) ? 1 : 0),
      breastMinutes: current.breastMinutes + breastMinutes,
      formulaMl: current.formulaMl + formulaMl,
      expressedMl: current.expressedMl + expressedMl,
      pumpMl: current.pumpMl + pumpMl,
      sleepMinutes: 0,
      peeCount: current.peeCount + (record.type === 'pee' ? 1 : 0),
      poopCount: current.poopCount + (record.type === 'poop' ? 1 : 0),
    };
  }, {
    feedingCount: 0,
    breastMinutes: 0,
    formulaMl: 0,
    expressedMl: 0,
    pumpMl: 0,
    sleepMinutes: 0,
    peeCount: 0,
    poopCount: 0,
  });
  return { ...summary, sleepMinutes: summarizeSleepMinutes(records, window) };
}
