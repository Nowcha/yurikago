import { describe, it, expect } from 'vitest';
import { resolveDueDate } from '../src/lib/deadline';
import { buildIcsCalendar, buildExportPayload } from '../src/lib/exporters';
import type { TaskInstance, Household, PurchaseItem } from '../src/types';
import procedureMaster from '../src/data/procedure-master.json';
import purchaseMaster from '../src/data/purchase-master.json';
import weeklyInfo from '../src/data/weekly-info.json';

const dueDate = '2026-10-01';
const birthDate = '2026-10-05';

function findTemplate(id: string) {
  const t = (procedureMaster.templates as { id: string }[]).find((x) => x.id === id);
  if (!t) throw new Error(`template not found: ${id}`);
  return t as unknown as { id: string; trigger: TaskInstance['trigger']; prepTasks?: string[] };
}

// 受け入れテストD: 起算日の違いが実データに正しく反映されているか
describe('procedure-master.json: 産後手続きの起算日', () => {
  it('出生届は出生日を含め14日以内 → 出生日+13日が期限', () => {
    const t = findTemplate('birth-registration');
    expect(resolveDueDate(t.trigger, dueDate, birthDate)).toBe('2026-10-18'); // 10/5 + 13
  });

  it('児童手当は出生翌日から15日以内（15日特例） → 出生日+15日が期限', () => {
    const t = findTemplate('child-allowance');
    expect(resolveDueDate(t.trigger, dueDate, birthDate)).toBe('2026-10-20'); // 10/5 + 15
  });

  it('出生届には準備サブタスクが4件ある（受け入れテストC）', () => {
    const t = findTemplate('birth-registration');
    expect(t.prepTasks).toHaveLength(4);
  });
});

// 受け入れテストE: 「産後に様子見て」バッジ対象品目
describe('purchase-master.json: waitUntilBornフラグ', () => {
  const items = purchaseMaster.items as { name: string; waitUntilBorn?: boolean }[];

  it('抱っこ紐・ベビーカー・搾乳器はwaitUntilBorn=trueで産後購入推奨になっている', () => {
    const flagged = items.filter((i) => i.waitUntilBorn).map((i) => i.name);
    expect(flagged).toEqual(
      expect.arrayContaining(['抱っこ紐', 'ベビーカー', '搾乳器']),
    );
  });
});

// 受け入れテストG: 週次情報がダッシュボード表示に必要な範囲を網羅しているか
describe('weekly-info.json: 週次サマリの網羅性', () => {
  it('妊娠4週〜41週まで欠番なく揃っている', () => {
    const weeks = (weeklyInfo.weeks as { week: number }[]).map((w) => w.week).sort((a, b) => a - b);
    expect(weeks[0]).toBe(4);
    expect(weeks[weeks.length - 1]).toBe(41);
    const missing = [];
    for (let w = weeks[0]; w <= weeks[weeks.length - 1]; w++) {
      if (!weeks.includes(w)) missing.push(w);
    }
    expect(missing).toEqual([]);
  });

  it('各週にbabySize/babyNote/momNoteが揃っている', () => {
    const incomplete = (weeklyInfo.weeks as Record<string, unknown>[]).filter(
      (w) => !w.babySize || !w.babyNote || !w.momNote,
    );
    expect(incomplete).toEqual([]);
  });
});

// 受け入れテストF: ICS/JSONエクスポートのロジック（DOM非依存部分）
describe('exporters: ICSカレンダー生成', () => {
  const base = {
    templateId: 't1', category: 'procedure' as const, trigger: { type: 'beforeDue' as const, days: 0 },
    createdAt: 0,
  };
  const tasks: TaskInstance[] = [
    { ...base, id: 'hard-todo', title: '法定・未完了', deadline: 'hard', status: 'todo', dueDateResolved: '2026-10-18' },
    { ...base, id: 'hard-done', title: '法定・完了済み', deadline: 'hard', status: 'done', dueDateResolved: '2026-10-20' },
    { ...base, id: 'soft-todo', title: '任意・未完了', deadline: 'soft', status: 'todo', dueDateResolved: '2026-10-15' },
    { ...base, id: 'hard-noDate', title: '法定・期限未定', deadline: 'hard', status: 'todo', dueDateResolved: null },
  ];

  it('法定期限かつ未完了かつ期限確定済みのタスクのみをイベント化する', () => {
    const ics = buildIcsCalendar(tasks);
    expect(ics).toContain('法定・未完了');
    expect(ics).not.toContain('法定・完了済み');
    expect(ics).not.toContain('任意・未完了');
    expect(ics).not.toContain('法定・期限未定');
  });

  it('各イベントに3日前アラームが付く', () => {
    const ics = buildIcsCalendar(tasks);
    expect(ics).toContain('TRIGGER:-P3D');
    expect((ics.match(/BEGIN:VALARM/g) ?? []).length).toBe(1);
  });

  it('DTSTARTがYYYYMMDD形式（ハイフンなし終日イベント）', () => {
    const ics = buildIcsCalendar(tasks);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261018');
  });
});

describe('exporters: JSONバックアップのペイロード構造', () => {
  it('household/tasks/items/recordsとexportedAtを含む', () => {
    const household: Household = {
      id: 'h1', name: 'テスト世帯', dueDate, memberUids: ['u1'], memberNames: { u1: 'テスト' },
    };
    const items: PurchaseItem[] = [];
    const payload = buildExportPayload(household, [], items, []);
    expect(payload.household).toEqual(household);
    expect(payload.tasks).toEqual([]);
    expect(payload.items).toEqual(items);
    expect(payload.records).toEqual([]);
    expect(typeof payload.exportedAt).toBe('string');
  });
});
