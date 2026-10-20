import { describe, it, expect } from 'vitest';
import {
  resolveDueDate,
  isBirthTrigger,
  pregnancyWeek,
  daysUntilDue,
  urgency,
  addDays,
  diffDays,
} from '../src/lib/deadline';

describe('日付ユーティリティ', () => {
  it('addDays: 月跨ぎ・年跨ぎ・うるう年', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // うるう年
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('diffDays', () => {
    expect(diffDays('2026-07-16', '2026-07-16')).toBe(0);
    expect(diffDays('2026-07-16', '2026-08-16')).toBe(31);
  });
});

describe('妊娠週数（予定日=40週0日）', () => {
  it('予定日当日は40週0日', () => {
    expect(pregnancyWeek('2026-10-01', '2026-10-01')).toEqual({ week: 40, day: 0 });
  });
  it('予定日の7日前は39週0日、1日前は39週6日', () => {
    expect(pregnancyWeek('2026-10-01', '2026-09-24')).toEqual({ week: 39, day: 0 });
    expect(pregnancyWeek('2026-10-01', '2026-09-30')).toEqual({ week: 39, day: 6 });
  });
  it('残り日数', () => {
    expect(daysUntilDue('2026-10-01', '2026-07-16')).toBe(77);
  });
});

describe('resolveDueDate: トリガーごとの起算規則', () => {
  const due = '2026-10-01';

  it('week: 妊娠w週0日の日付を返す', () => {
    // 40週0日 = 予定日
    expect(resolveDueDate({ type: 'week', week: 40 }, due)).toBe('2026-10-01');
    // 34週0日 = 予定日の42日前
    expect(resolveDueDate({ type: 'week', week: 34 }, due)).toBe('2026-08-20');
  });

  it('beforeDue: 予定日のn日前', () => {
    expect(resolveDueDate({ type: 'beforeDue', days: 60 }, due)).toBe('2026-08-02');
  });

  it('afterBirth: 出生日未確定ならnull', () => {
    expect(resolveDueDate({ type: 'afterBirth', days: 14 }, due, null)).toBeNull();
    expect(resolveDueDate({ type: 'afterBirth', days: 14 }, due, undefined)).toBeNull();
  });

  it('出生届: 出生日を含め14日以内（birthInclusive）→ 出生日+13', () => {
    // 10/5生まれ → 10/18が期限（10/5を1日目と数える）
    expect(
      resolveDueDate(
        { type: 'afterBirth', days: 14, countFrom: 'birthInclusive' },
        due,
        '2026-10-05',
      ),
    ).toBe('2026-10-18');
  });

  it('児童手当: 出生翌日から15日以内（nextDay既定）→ 出生日+15', () => {
    // 10/5生まれ → 10/6起算で15日 → 10/20が期限
    expect(
      resolveDueDate({ type: 'afterBirth', days: 15 }, due, '2026-10-05'),
    ).toBe('2026-10-20');
  });

  it('起算規則の差で出生届と児童手当の期限が2日ずれる', () => {
    const birth = '2026-10-05';
    const reg = resolveDueDate(
      { type: 'afterBirth', days: 14, countFrom: 'birthInclusive' }, due, birth)!;
    const allowance = resolveDueDate({ type: 'afterBirth', days: 15 }, due, birth)!;
    expect(diffDays(reg, allowance)).toBe(2);
  });

  it('nextDateAfterBirth: 出生日+minDays以降で最初に来る月日（初節句）', () => {
    const girl = { type: 'nextDateAfterBirth', month: 3, day: 3, minDays: 60 } as const;
    // 10/5生まれ → +60日=12/4 → 翌年3/3
    expect(resolveDueDate(girl, due, '2026-10-05')).toBe('2027-03-03');
    // 1/2生まれ → +60日=3/3 当日は今年に含める
    expect(resolveDueDate(girl, due, '2027-01-02')).toBe('2027-03-03');
    // 1/3生まれ → +60日=3/4 → 翌年へ回す
    expect(resolveDueDate(girl, due, '2027-01-03')).toBe('2028-03-03');
    expect(resolveDueDate(girl, due, null)).toBeNull();
  });

  it('birthday: 満n歳の誕生日。2/29生まれは平年なら3/1', () => {
    expect(resolveDueDate({ type: 'birthday', years: 1 }, due, '2026-10-05')).toBe('2027-10-05');
    expect(resolveDueDate({ type: 'birthday', years: 1 }, due, '2028-02-29')).toBe('2029-03-01');
    expect(resolveDueDate({ type: 'birthday', years: 4 }, due, '2028-02-29')).toBe('2032-02-29');
    expect(resolveDueDate({ type: 'birthday', years: 1 }, due, null)).toBeNull();
  });

  it('isBirthTrigger: 出生日で期限が決まるトリガーだけを対象にする', () => {
    expect(isBirthTrigger({ type: 'afterBirth', days: 14 })).toBe(true);
    expect(isBirthTrigger({ type: 'nextDateAfterBirth', month: 5, day: 5, minDays: 60 })).toBe(true);
    expect(isBirthTrigger({ type: 'birthday', years: 1 })).toBe(true);
    expect(isBirthTrigger({ type: 'beforeDue', days: 30 })).toBe(false);
    expect(isBirthTrigger({ type: 'week', week: 20 })).toBe(false);
  });
});

describe('urgency', () => {
  const today = '2026-07-16';
  it('期限超過 / 7日以内 / 30日以内 / それ以降 / 未確定', () => {
    expect(urgency('2026-07-15', today)).toBe('overdue');
    expect(urgency('2026-07-16', today)).toBe('imminent');
    expect(urgency('2026-07-23', today)).toBe('imminent');
    expect(urgency('2026-07-24', today)).toBe('upcoming');
    expect(urgency('2026-08-15', today)).toBe('upcoming');
    expect(urgency('2026-08-16', today)).toBe('later');
    expect(urgency(null, today)).toBe('unscheduled');
  });
});
