import type { Trigger } from '../types';

/**
 * 日付計算はすべてUTC正午基準のYYYY-MM-DD文字列で行う（タイムゾーン・DSTの影響排除）。
 * 妊娠週数の規約: 出産予定日 = 妊娠40週0日 = 妊娠281日目（0週0日から280日後）。
 */

const DAY = 86_400_000;

export function toDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  return toYmd(new Date(toDate(ymd).getTime() + days * DAY));
}

export function diffDays(fromYmd: string, toYmdStr: string): number {
  return Math.round((toDate(toYmdStr).getTime() - toDate(fromYmd).getTime()) / DAY);
}

/** 妊娠0週0日の日付（予定日の280日前） */
export function pregnancyStart(dueDate: string): string {
  return addDays(dueDate, -280);
}

/** 今日時点の妊娠週数・日数。出産前提の範囲外は丸めない（負値もあり得る） */
export function pregnancyWeek(dueDate: string, today: string): { week: number; day: number } {
  const elapsed = diffDays(pregnancyStart(dueDate), today);
  return { week: Math.floor(elapsed / 7), day: ((elapsed % 7) + 7) % 7 };
}

/** 予定日までの残り日数（当日=0） */
export function daysUntilDue(dueDate: string, today: string): number {
  return diffDays(today, dueDate);
}

/**
 * トリガー→期限日の解決。
 * - week: その週に入る日（妊娠w週0日）を期限起点として返す
 * - beforeDue: 予定日のn日前
 * - afterBirth: 出生日基準。countFromで起算規則を切り替える
 *     - 'birthInclusive': 出生日を1日目と数えてn日以内 → 出生日 + (n-1)。例: 出生届（14日以内）
 *     - 'nextDay'（既定）: 出生日の翌日から起算してn日以内 → 出生日 + n。例: 児童手当（15日特例）
 *   出生日未確定（birthDate == null）の場合は null を返す
 */
export function resolveDueDate(
  trigger: Trigger,
  dueDate: string,
  birthDate?: string | null,
): string | null {
  switch (trigger.type) {
    case 'week':
      return addDays(pregnancyStart(dueDate), trigger.week * 7);
    case 'beforeDue':
      return addDays(dueDate, -trigger.days);
    case 'afterBirth': {
      if (!birthDate) return null;
      const offset =
        trigger.countFrom === 'birthInclusive' ? trigger.days - 1 : trigger.days;
      return addDays(birthDate, offset);
    }
  }
}

export type Urgency = 'overdue' | 'imminent' | 'upcoming' | 'later' | 'unscheduled';

/** ダッシュボード用の緊急度判定。imminent=7日以内 */
export function urgency(dueDateResolved: string | null, today: string): Urgency {
  if (!dueDateResolved) return 'unscheduled';
  const d = diffDays(today, dueDateResolved);
  if (d < 0) return 'overdue';
  if (d <= 7) return 'imminent';
  if (d <= 30) return 'upcoming';
  return 'later';
}

export function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate(),
  ).padStart(2, '0')}`;
}
