import type { Assignee, PurchaseItem, TaskCategory, TaskInstance } from '../types';
import { resolveDueDate, urgency, type Urgency } from './deadline';

/** ダッシュボード集計・スプリント抽出などの表示用ロジック（Firestore非依存） */

export type AssigneeGroupKey = Assignee | 'none';

export function groupTasksByAssignee(
  tasks: TaskInstance[],
): Record<AssigneeGroupKey, TaskInstance[]> {
  const groups: Record<AssigneeGroupKey, TaskInstance[]> = {
    partner1: [], partner2: [], both: [], none: [],
  };
  return tasks.reduce((acc, t) => {
    const key: AssigneeGroupKey = t.assignee ?? 'none';
    return { ...acc, [key]: [...acc[key], t] };
  }, groups);
}

export interface CategoryProgress {
  category: TaskCategory;
  done: number;
  total: number; // naを除いた件数
}

/** カテゴリ別の進捗。タスクの登場順にカテゴリを並べ、全件naのカテゴリは除く */
export function categoryProgress(tasks: TaskInstance[]): CategoryProgress[] {
  const order: TaskCategory[] = [];
  const byCategory = new Map<TaskCategory, { done: number; total: number }>();
  for (const t of tasks) {
    if (t.status === 'na') continue;
    if (!byCategory.has(t.category)) {
      order.push(t.category);
      byCategory.set(t.category, { done: 0, total: 0 });
    }
    const entry = byCategory.get(t.category)!;
    byCategory.set(t.category, {
      done: entry.done + (t.status === 'done' ? 1 : 0),
      total: entry.total + 1,
    });
  }
  return order.map((category) => ({ category, ...byCategory.get(category)! }));
}

export interface PurchaseAlert {
  item: PurchaseItem;
  due: string;
  urgency: Urgency;
}

/** 準備品の必要日。利用者の上書きがあればマスター計算より優先する */
export function purchaseDueDate(
  item: PurchaseItem,
  dueDate: string,
  birthDate: string | null | undefined,
): string | null {
  return item.neededByDateOverride ?? resolveDueDate(item.neededBy, dueDate, birthDate);
}

/**
 * 準備品の期限接近アラート。未完了かつ「産後様子見」でないもののうち、
 * 期限超過・7日以内のものを期限昇順で返す
 */
export function purchaseAlerts(
  items: PurchaseItem[],
  dueDate: string,
  birthDate: string | null | undefined,
  today: string,
): PurchaseAlert[] {
  return items
    .filter((i) => i.status === 'todo' && !i.waitUntilBorn)
    .flatMap((item) => {
      const due = purchaseDueDate(item, dueDate, birthDate);
      if (!due) return [];
      const u = urgency(due, today);
      return u === 'overdue' || u === 'imminent' ? [{ item, due, urgency: u }] : [];
    })
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/**
 * 産後2週間スプリント: 出生後14日以内のタスクを期限昇順、同日はhard（法定）優先で返す。
 * 完了済みも含める（スプリントの消し込み状況を可視化するため）
 */
export function sprintTasks(tasks: TaskInstance[]): TaskInstance[] {
  return tasks
    .filter((t) => t.trigger.type === 'afterBirth' && t.trigger.days <= 14)
    .slice()
    .sort((a, b) => {
      const dueA = a.dueDateResolved ?? '9999-12-31';
      const dueB = b.dueDateResolved ?? '9999-12-31';
      if (dueA !== dueB) return dueA < dueB ? -1 : 1;
      if (a.deadline !== b.deadline) return a.deadline === 'hard' ? -1 : 1;
      return 0;
    });
}
