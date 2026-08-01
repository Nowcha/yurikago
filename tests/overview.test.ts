import { describe, it, expect } from 'vitest';
import {
  groupTasksByAssignee,
  categoryProgress,
  purchaseDueDate,
  purchaseAlerts,
  sprintTasks,
} from '../src/lib/overview';
import type { TaskInstance, PurchaseItem } from '../src/types';

function task(partial: Partial<TaskInstance> & { id: string }): TaskInstance {
  return {
    title: partial.id,
    category: 'procedure',
    trigger: { type: 'beforeDue', days: 0 },
    status: 'todo',
    dueDateResolved: null,
    createdAt: 0,
    ...partial,
  };
}

function item(partial: Partial<PurchaseItem> & { id: string }): PurchaseItem {
  return {
    name: partial.id,
    category: 'other',
    neededBy: { type: 'beforeDue', days: 14 },
    method: 'buy',
    status: 'todo',
    ...partial,
  };
}

describe('groupTasksByAssignee', () => {
  it('担当ごとにグループ化し、未割当はnoneに入る', () => {
    const tasks = [
      task({ id: 'a', assignee: 'partner1' }),
      task({ id: 'b', assignee: 'partner2' }),
      task({ id: 'c', assignee: 'both' }),
      task({ id: 'd' }),
      task({ id: 'e', assignee: 'partner1' }),
    ];
    const g = groupTasksByAssignee(tasks);
    expect(g.partner1.map((t) => t.id)).toEqual(['a', 'e']);
    expect(g.partner2.map((t) => t.id)).toEqual(['b']);
    expect(g.both.map((t) => t.id)).toEqual(['c']);
    expect(g.none.map((t) => t.id)).toEqual(['d']);
  });

  it('空配列でも全キーが存在する', () => {
    const g = groupTasksByAssignee([]);
    expect(g).toEqual({ partner1: [], partner2: [], both: [], none: [] });
  });
});

describe('categoryProgress', () => {
  it('カテゴリごとにdone/totalを集計し、naは分母から除外する', () => {
    const tasks = [
      task({ id: 'a', category: 'procedure', status: 'done' }),
      task({ id: 'b', category: 'procedure', status: 'todo' }),
      task({ id: 'c', category: 'procedure', status: 'na' }),
      task({ id: 'd', category: 'health', status: 'done' }),
    ];
    const p = categoryProgress(tasks);
    expect(p).toEqual([
      { category: 'procedure', done: 1, total: 2 },
      { category: 'health', done: 1, total: 1 },
    ]);
  });

  it('全タスクがnaのカテゴリは結果に含めない', () => {
    const tasks = [task({ id: 'a', category: 'work', status: 'na' })];
    expect(categoryProgress(tasks)).toEqual([]);
  });
});

describe('purchaseAlerts', () => {
  const dueDate = '2026-10-01';

  it('期限が7日以内（imminent）と超過（overdue）のtodoを期限順で返す', () => {
    const items = [
      item({ id: 'far', neededBy: { type: 'beforeDue', days: 60 } }),   // 8/2 → later
      item({ id: 'soon', neededBy: { type: 'beforeDue', days: 75 } }),  // 7/18 → overdue
      item({ id: 'now', neededBy: { type: 'beforeDue', days: 70 } }),   // 7/23 → imminent
    ];
    const alerts = purchaseAlerts(items, dueDate, null, '2026-07-20');
    expect(alerts.map((a) => a.item.id)).toEqual(['soon', 'now']);
    expect(alerts[0].urgency).toBe('overdue');
    expect(alerts[0].due).toBe('2026-07-18');
    expect(alerts[1].urgency).toBe('imminent');
  });

  it('done・skipped・産後様子見は対象外', () => {
    const items = [
      item({ id: 'a', status: 'done', neededBy: { type: 'beforeDue', days: 75 } }),
      item({ id: 'b', status: 'skipped', neededBy: { type: 'beforeDue', days: 75 } }),
      item({ id: 'c', waitUntilBorn: true, neededBy: { type: 'beforeDue', days: 75 } }),
    ];
    expect(purchaseAlerts(items, dueDate, null, '2026-07-20')).toEqual([]);
  });

  it('afterBirthの準備品は出生日未確定なら対象外、確定後は期限計算される', () => {
    const items = [item({ id: 'a', neededBy: { type: 'afterBirth', days: 3 } })];
    expect(purchaseAlerts(items, dueDate, null, '2026-07-20')).toEqual([]);
    const alerts = purchaseAlerts(items, dueDate, '2026-07-19', '2026-07-20');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].due).toBe('2026-07-22');
  });

  it('必要日の手動上書きを期限計算とアラートに優先する', () => {
    const overridden = item({
      id: 'overridden',
      neededBy: { type: 'beforeDue', days: 7 },
      neededByDateOverride: '2026-07-22',
    });
    expect(purchaseDueDate(overridden, dueDate, null)).toBe('2026-07-22');
    expect(purchaseAlerts([overridden], dueDate, null, '2026-07-20')[0].due).toBe('2026-07-22');
  });
});

describe('sprintTasks', () => {
  it('出生後14日以内のタスクのみを期限昇順・同日ならhard優先で返す', () => {
    const tasks = [
      task({ id: 'prep', trigger: { type: 'beforeDue', days: 30 }, dueDateResolved: '2026-09-01' }),
      task({
        id: 'later',
        trigger: { type: 'afterBirth', days: 30 },
        dueDateResolved: '2026-10-31',
      }),
      task({
        id: 'hard14',
        trigger: { type: 'afterBirth', days: 14, countFrom: 'birthInclusive' },
        deadline: 'hard',
        dueDateResolved: '2026-10-14',
      }),
      task({
        id: 'hard-same-day',
        trigger: { type: 'afterBirth', days: 14 },
        deadline: 'hard',
        dueDateResolved: '2026-10-14',
      }),
    ];
    expect(sprintTasks(tasks).map((t) => t.id)).toEqual(['hard14', 'hard-same-day']);
  });

  it('完了・対象外タスクも表示対象に含む（スプリントの消し込みを可視化するため）', () => {
    const tasks = [
      task({ id: 'a', trigger: { type: 'afterBirth', days: 5 }, status: 'done', dueDateResolved: '2026-10-06' }),
    ];
    expect(sprintTasks(tasks)).toHaveLength(1);
  });
});
