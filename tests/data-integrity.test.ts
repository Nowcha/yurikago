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

describe('procedure-master.json: 初期ラインナップ', () => {
  const templates = procedureMaster.templates as {
    id: string;
    authority?: string;
    deadline?: string;
    links?: { url: string }[];
  }[];

  it('初回利用に必要な妊娠初期・産後健診・予防接種タスクが揃っている', () => {
    const ids = templates.map((template) => template.id);
    expect(ids).toEqual(expect.arrayContaining([
      'pregnancy-notification',
      'pregnancy-support-first',
      'postpartum-checkup-2w',
      'postpartum-checkup-1m',
      'newborn-hearing-screening',
      'infant-checkup-1m',
      'vaccination-plan',
      'birth-leave-support-benefit',
    ]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('行政制度とhard期限には公式リンクがある', () => {
    const missing = templates.filter((template) => {
      const needsOfficialLink = ['koto', 'tokyo', 'national'].includes(template.authority ?? '')
        || template.deadline === 'hard';
      return needsOfficialLink && !template.links?.some((link) => link.url.startsWith('https://'));
    });
    expect(missing).toEqual([]);
  });

  it('健保加入は一律5日hardにせず、妊婦支援給付2回目は産後タスクにする', () => {
    const insurance = findTemplate('health-insurance-dependent') as unknown as {
      trigger: TaskInstance['trigger'];
      deadline: string;
    };
    const support = findTemplate('ninpu-shien-2nd');
    expect(insurance.trigger).toEqual({ type: 'afterBirth', days: 14 });
    expect(insurance.deadline).toBe('soft');
    expect(support.trigger.type).toBe('afterBirth');
  });
});

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

  it('日常着と安全な寝床の注意が含まれる', () => {
    const names = items.map((item) => item.name);
    const safeBed = (purchaseMaster.items as { name: string; memo?: string }[])
      .find((item) => item.name === '赤ちゃん専用の安全な寝床');
    expect(names.some((name) => name.includes('カバーオール'))).toBe(true);
    expect(safeBed?.memo).toContain('硬く平坦');
    expect(safeBed?.memo).toContain('掛け布団');
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

  it('すべての出典に参照URLがある', () => {
    const sources = weeklyInfo.sources as { label: string; url: string }[];
    expect(sources.every((source) => source.url.startsWith('https://'))).toBe(true);
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
