import { useState } from 'react';
import type {
  Household, PurchaseItem, PurchaseCategory, PurchaseMethod, Assignee,
} from '../types';
import {
  updateItem, addItem, clearItemAssignee, updateItemDetails, removeItem,
} from '../lib/store';
import { purchaseAlerts, purchaseDueDate } from '../lib/overview';
import { assigneeLabel } from '../lib/labels';
import { todayYmd } from '../lib/deadline';
import { Pencil } from 'lucide-react';

const CATEGORIES: { id: PurchaseCategory; label: string }[] = [
  { id: 'sleep', label: 'ねんね' },
  { id: 'feeding', label: '授乳・ミルク' },
  { id: 'bath', label: 'おふろ' },
  { id: 'clothing', label: '衣類' },
  { id: 'outing', label: 'おでかけ' },
  { id: 'mom', label: 'ママ用品' },
  { id: 'other', label: 'その他' },
];
const METHOD_LABEL: Record<PurchaseMethod, string> = {
  buy: '購入', rental: 'レンタル', handmedown: 'お下がり', gift: 'もらう', undecided: '未定',
};
const METHODS = Object.entries(METHOD_LABEL) as [PurchaseMethod, string][];

export default function Purchases({ household, items }: {
  household: Household; items: PurchaseItem[];
}) {
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState<PurchaseItem | null>(null);
  const today = todayYmd();
  const active = items.filter((i) => i.status !== 'skipped');
  const budget = active.reduce((s, i) => s + (i.budget ?? 0), 0);
  const spent = items.filter((i) => i.status === 'done')
    .reduce((s, i) => s + (i.actualCost ?? i.budget ?? 0), 0);
  const alerts = purchaseAlerts(items, household.dueDate, household.birthDate, today);

  return (
    <div className="px-5 pt-8">
      <h1 className="font-display text-xl font-bold text-ink">準備品</h1>
      <div className="mt-3 flex items-baseline gap-3 rounded-2xl bg-white p-4 border border-ink/10">
        <p className="font-display text-2xl font-bold text-sub">¥{spent.toLocaleString()}</p>
        <p className="text-sm text-ink/50">/ 予算 ¥{budget.toLocaleString()}</p>
      </div>

      {alerts.length > 0 && (
        <section className="mt-4 rounded-2xl border border-ink bg-white p-4">
          <h2 className="font-display text-sm font-bold text-ink">そろそろ準備の時期です</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {alerts.map(({ item, due, urgency: u }) => (
              <li key={item.id} className="flex items-baseline justify-between gap-2">
                <span className="truncate">・{item.name}</span>
                <span className={`shrink-0 text-xs ${u === 'overdue' ? 'font-bold' : 'text-ink/50'}`}>
                  {due}まで{u === 'overdue' && '（超過）'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {CATEGORIES.map((c) => {
        const list = items.filter((i) => i.category === c.id);
        if (list.length === 0) return null;
        return (
          <section key={c.id} className="mt-6">
            <h2 className="text-sm font-bold text-ink/60">{c.label}</h2>
            <ul className="mt-2 space-y-2">
              {list.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  household={household}
                  onOpen={() => setSelected(i)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <form
        className="mt-8 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          addItem(household.id, {
            name: newName.trim(), category: 'other',
            neededBy: { type: 'beforeDue', days: 14 },
            method: 'undecided', status: 'todo',
          });
          setNewName('');
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="準備品を追加"
          className="flex-1 rounded-full border border-accent/20 bg-white px-4 py-3 text-sm"
        />
        <button className="rounded-full bg-accent px-5 font-bold text-white">追加</button>
      </form>

      {selected && (
        <PurchaseSheet
          key={selected.id}
          item={items.find((item) => item.id === selected.id) ?? selected}
          household={household}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/** 担当のタップ順: 未設定 → partner1 → partner2 → ふたり → 未設定 */
function nextAssignee(current?: Assignee): Assignee | undefined {
  switch (current) {
    case undefined: return 'partner1';
    case 'partner1': return 'partner2';
    case 'partner2': return 'both';
    case 'both': return undefined;
  }
}

function ItemRow({ item, household, onOpen }: {
  item: PurchaseItem;
  household: Household;
  onOpen: () => void;
}) {
  const householdId = household.id;
  const done = item.status === 'done';
  const skipped = item.status === 'skipped';
  const due = purchaseDueDate(item, household.dueDate, household.birthDate);
  const cycleAssignee = () => {
    const next = nextAssignee(item.assignee);
    return next
      ? updateItem(householdId, item.id, { assignee: next })
      : clearItemAssignee(householdId, item.id);
  };
  return (
    <li className={`rounded-2xl bg-white p-4 border border-ink/10 ${skipped ? 'opacity-40' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => updateItem(householdId, item.id, { status: e.target.checked ? 'done' : 'todo' })}
          className="mt-1 h-5 w-5"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium text-ink ${done ? 'line-through opacity-60' : ''}`}>
            {item.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
            <span className="rounded bg-base px-1.5 py-0.5">{METHOD_LABEL[item.method]}</span>
            {item.budget != null && <span>予算¥{item.budget.toLocaleString()}</span>}
            {item.waitUntilBorn && (
              <span className="rounded bg-sub/15 px-1.5 py-0.5 text-sub">産後に様子見て</span>
            )}
            {!skipped && (
              <button
                type="button"
                onClick={cycleAssignee}
                aria-label="担当を切り替え"
                className={`rounded-full px-2 py-0.5 ${
                  item.assignee
                    ? 'bg-surface font-medium text-accent'
                    : 'border border-dashed border-ink/25 text-ink/40'
                }`}
              >
                {item.assignee ? assigneeLabel(item.assignee, household) : '担当'}
              </button>
            )}
          </p>
          {item.memo && <p className="mt-1 text-xs text-ink/50">{item.memo}</p>}
          {item.userMemo && (
            <p className="mt-1 rounded-lg bg-base px-2 py-1.5 text-xs text-ink/70">
              {item.userMemo}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!skipped && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await updateItem(householdId, item.id, { status: 'skipped' });
                } catch {
                  alert('状態を変更できませんでした');
                }
              }}
              className="px-1 py-2 text-xs text-ink/40"
            >
              不要
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${item.name}を編集`}
            className="rounded-full border border-ink/10 p-2 text-ink/50"
          >
            <Pencil size={15} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </div>
      {due && <p className="mt-2 pl-8 text-xs text-ink/40">必要日 {due}</p>}
      {done && (
        <label className="mt-2 block pl-8 text-xs text-ink/50">
          実費 ¥
          <input
            key={item.actualCost ?? 'empty'}
            type="number"
            defaultValue={item.actualCost ?? ''}
            onBlur={(e) => {
              if (e.target.value === '') return; // Firestoreはundefinedを拒否するため空は更新しない
              updateItem(householdId, item.id, { actualCost: Number(e.target.value) });
            }}
            className="ml-1 w-28 rounded-lg border border-accent/20 bg-base px-2 py-1"
          />
        </label>
      )}
    </li>
  );
}

function PurchaseSheet({ item, household, onClose }: {
  item: PurchaseItem;
  household: Household;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<PurchaseCategory>(item.category);
  const [method, setMethod] = useState<PurchaseMethod>(item.method);
  const [budget, setBudget] = useState(item.budget?.toString() ?? '');
  const [actualCost, setActualCost] = useState(item.actualCost?.toString() ?? '');
  const [neededDate, setNeededDate] = useState(
    item.neededByDateOverride
      ?? purchaseDueDate(item, household.dueDate, household.birthDate)
      ?? '',
  );
  const [userMemo, setUserMemo] = useState(item.userMemo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    if (!name.trim()) return;
    const parsedBudget = budget === '' ? null : Number(budget);
    const parsedActualCost = actualCost === '' ? null : Number(actualCost);
    if ((parsedBudget != null && (!Number.isFinite(parsedBudget) || parsedBudget < 0))
      || (parsedActualCost != null && (!Number.isFinite(parsedActualCost) || parsedActualCost < 0))) {
      setError('予算と実費は0以上の数値で入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const calculatedDate = purchaseDueDate(
        { ...item, neededByDateOverride: undefined },
        household.dueDate,
        household.birthDate,
      );
      const overrideDate = neededDate === ''
        || (!item.neededByDateOverride && neededDate === calculatedDate)
        ? null
        : neededDate;
      await updateItemDetails(household.id, item.id, {
        name: name.trim(),
        category,
        method,
        budget: parsedBudget,
        actualCost: parsedActualCost,
        neededByDateOverride: overrideDate,
        userMemo,
      });
      onClose();
    } catch {
      setError('準備品の変更を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: PurchaseItem['status']): Promise<void> => {
    setError(null);
    try {
      await updateItem(household.id, item.id, { status });
    } catch {
      setError('状態を変更できませんでした。');
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/40" onClick={onClose}>
      <div
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 pb-10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
        <h2 className="font-display text-lg font-bold text-ink">準備品を編集</h2>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-bold text-ink/50">
            品名
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold text-ink/50">
              カテゴリ
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as PurchaseCategory)}
                className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
              >
                {CATEGORIES.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-ink/50">
              入手方法
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as PurchaseMethod)}
                className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
              >
                {METHODS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="予算" value={budget} onChange={setBudget} />
            <NumberField label="実費" value={actualCost} onChange={setActualCost} />
          </div>
          <label className="block text-xs font-bold text-ink/50">
            必要日
            <input
              type="date"
              value={neededDate}
              onChange={(event) => setNeededDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
            />
          </label>
          {item.neededByDateOverride && (
            <button
              type="button"
              onClick={() => setNeededDate('')}
              className="text-xs font-bold text-accent underline underline-offset-2"
            >
              マスターの必要日に戻す
            </button>
          )}
          {item.memo && (
            <p className="rounded-xl bg-base p-3 text-xs leading-relaxed text-ink/60">
              {item.memo}
            </p>
          )}
          <label className="block text-xs font-bold text-ink/50">
            家庭メモ
            <textarea
              value={userMemo}
              onChange={(event) => setUserMemo(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
            />
          </label>
        </div>

        <p className="mt-5 text-xs font-bold text-ink/50">状態</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {([
            ['todo', '未準備'], ['done', '準備済み'], ['skipped', '不要'],
          ] as const).map(([status, label]) => (
            <button
              key={status}
              type="button"
              onClick={() => void setStatus(status)}
              className={`rounded-full py-2 text-sm font-medium ${
                item.status === status ? 'bg-accent text-white' : 'bg-base text-ink/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-alert">{error}</p>}
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={save}
          className="mt-5 w-full rounded-full bg-accent py-3 font-bold text-white disabled:opacity-40"
        >
          {saving ? '保存中…' : '変更を保存'}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!confirm('この準備品を削除しますか？')) return;
            setSaving(true);
            try {
              await removeItem(household.id, item.id);
              onClose();
            } catch {
              setError('準備品を削除できませんでした。');
              setSaving(false);
            }
          }}
          className="mt-3 w-full rounded-full bg-alert/10 py-2.5 text-sm font-bold text-alert"
        >
          準備品を削除
        </button>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold text-ink/50">
      {label}（円）
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
      />
    </label>
  );
}
