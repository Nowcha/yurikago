import { describe, expect, it } from 'vitest';
import { parsePositiveMeasurement, summarizeCareDay } from '../src/lib/records';
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
      breastMinutes: 0,
      formulaMl: 140,
      pumpMl: 40,
      sleepMinutes: 0,
      peeCount: 2,
      poopCount: 1,
    });
  });

  it('記録がない日はすべて0を返す', () => {
    expect(summarizeCareDay([])).toEqual({
      feedingCount: 0,
      breastMinutes: 0,
      formulaMl: 0,
      pumpMl: 0,
      sleepMinutes: 0,
      peeCount: 0,
      poopCount: 0,
    });
  });

  it('不正なミルク量は合計に含めない', () => {
    const records = [
      record('1', 'formula', -20),
      record('2', 'formula', Number.NaN),
      record('3', 'formula', 50),
    ];
    expect(summarizeCareDay(records).formulaMl).toBe(50);
  });

  it('母乳の授乳時間と搾乳量を集計する', () => {
    const records: CareRecord[] = [
      { id: '1', type: 'breast_l', at: 1, durationMin: 12 },
      { id: '2', type: 'breast_r', at: 2, durationMin: 8 },
      { id: '3', type: 'pump', at: 3, amountMl: 45 },
      { id: '4', type: 'pump', at: 4, amountMl: -10 },
    ];
    const summary = summarizeCareDay(records);
    expect(summary.breastMinutes).toBe(20);
    expect(summary.pumpMl).toBe(45);
  });

  it('前日から続く睡眠を日付境界で切って集計する', () => {
    const minute = 60_000;
    const startAt = 1_000_000_000;
    const endAt = startAt + (24 * 60 * minute);
    const records: CareRecord[] = [
      { id: '1', type: 'sleep', at: startAt - (30 * minute) },
      { id: '2', type: 'wake', at: startAt + (30 * minute) },
      { id: '3', type: 'sleep', at: startAt + (60 * minute) },
      { id: '4', type: 'wake', at: startAt + (120 * minute) },
    ];
    expect(summarizeCareDay(records, { startAt, endAt }).sleepMinutes).toBe(90);
  });

  it('継続中の睡眠は現在時刻までを集計する', () => {
    const minute = 60_000;
    const startAt = 2_000_000_000;
    const endAt = startAt + (24 * 60 * minute);
    const records: CareRecord[] = [
      { id: '1', type: 'sleep', at: startAt + (10 * minute) },
    ];
    const summary = summarizeCareDay(records, {
      startAt,
      endAt,
      nowAt: startAt + (70 * minute),
    });
    expect(summary.sleepMinutes).toBe(60);
  });
});

describe('parsePositiveMeasurement', () => {
  it('正の有限値を数値へ変換する', () => {
    expect(parsePositiveMeasurement('80')).toBe(80);
    expect(parsePositiveMeasurement('36.8')).toBe(36.8);
  });

  it.each(['', '0', '-1', 'NaN', 'Infinity'])('%sは無効値として扱う', (value) => {
    expect(parsePositiveMeasurement(value)).toBeNull();
  });
});
