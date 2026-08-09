import { addDays, todayYmd } from './deadline';

/**
 * 日付入力の許容範囲。
 * 予定日は40件すべての期限計算の起点なので、年を1桁打ち間違えると
 * タイムライン全体が壊れる。ブラウザ側で弾けるものは弾く。
 */
export interface DateBounds {
  min: string;
  max: string;
}

const DAYS_IN_YEAR = 365;

/** 出産予定日: 今日の前後1年。過去にも許すのは、生まれた後から使い始める場合があるため */
export function dueDateBounds(today: string = todayYmd()): DateBounds {
  return { min: addDays(today, -DAYS_IN_YEAR), max: addDays(today, DAYS_IN_YEAR) };
}

/** 出生日: 未来は取り得ない。過去は1年前まで */
export function birthDateBounds(today: string = todayYmd()): DateBounds {
  return { min: addDays(today, -DAYS_IN_YEAR), max: today };
}

/** タスクの期限・準備品の必要日: 桁違いだけを弾く緩い範囲（前後2年） */
export function taskDateBounds(today: string = todayYmd()): DateBounds {
  return { min: addDays(today, -DAYS_IN_YEAR * 2), max: addDays(today, DAYS_IN_YEAR * 2) };
}
