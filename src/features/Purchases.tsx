import { useState } from 'react';
import type {
  Household, PurchaseItem, PurchaseCategory, PurchaseMethod, Assignee,
} from '../types';
import {
  updateItem, addItem, clearItemAssignee, updateItemDetails, removeItem, restoreItem,
} from '../lib/store';
import { purchaseAlerts, purchaseDueDate } from '../lib/overview';
import { assigneeLabel } from '../lib/labels';
import { todayYmd } from '../lib/deadline';
import { Pencil, X } from 'lucide-react';
import { taskDateBounds } from '../lib/dateBounds';
import Sheet from '../components/Sheet';
import { useToast } from '../components/Toast';
import { describeWriteError } from '../lib/sync';
import { useMediaQuery, WIDE_SCREEN } from '../hooks/useMediaQuery';

const TASK_DATE_BOUNDS = taskDateBounds();

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
const ASSIGNEE_OPTIONS: Assignee[] = ['partner1', 'partner2', 'both'];

export default function Purchases({ household, items }: {
  household: Household; items: PurchaseItem[];
}) {
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE_SCREEN);
  const today = todayYmd();
  const active = items.filter((i) => i.status !== 'skipped');
  const budget = active.reduce((s, i) => s + (i.budget ?? 0), 0);
  const spent = items.filter((i) => i.status === 'done')
    .reduce((s, i) => s + (i.actualCost ?? i.budget ?? 0), 0);
  const alerts = purchaseAlerts(items, household.dueDate, household.birthDate, today);

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-8 md:max-w-xl lg:max-w-5xl xl:flex xl:max-w-[88rem] xl:justify-center xl:gap-8">
      <div className="min-w-0 xl:max-w-4xl xl:flex-1">
      <h1 className="font-display text-xl font-bold text-ink">準備品</h1>
      <div className="mt-3 flex items-baseline gap-3 rounded-2xl bg-white p-4 border border-ink/10">
        <p className="font-display text-2xl font-bold text-sub">¥{spent.toLocaleString()}</p>
        <p className="text-sm text-sub">/ 予算 ¥{budget.toLocaleString()}</p>
      </div>

      {alerts.length > 0 && (
        <section className="mt-4 rounded-2xl border border-ink bg-white p-4">
          <h2 className="font-display text-sm font-bold text-ink">そろそろ準備の時期です</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {alerts.map(({ item, due, urgency: u }) => (
              <li key={item.id} className="flex items-baseline justify-between gap-2">
                <span className="truncate">・{item.name}</span>
                <span className={`shrink-0 text-xs ${u === 'overdue' ? 'font-bold' : 'text-sub'}`}>
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
            <h2 className="text-sm font-bold text-sub">{c.label}</h2>
            <ul className="mt-2 space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0 xl:grid-cols-1 2xl:grid-cols-2">
              {list.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  household={household}
                  onOpen={() => setSelectedId(i.id)}
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
        <button className="rounded-full bg-accent hover:bg-ink/85 px-5 font-bold text-white">追加</button>
      </form>

      </div>

      {/* 広い画面では一覧を隠さず併置する */}
      {wide && (
        <aside className="sticky top-8 hidden h-fit max-h-[calc(100dvh-4rem)] w-[26rem] shrink-0 overflow-y-auto rounded-2xl border border-ink/10 bg-white p-6 xl:block">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-ink">準備品を編集</h2>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="詳細を閉じる"
                  className="-mr-2 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-sub hover:bg-surface hover:text-ink"
                >
                  <X size={20} strokeWidth={1.6} aria-hidden />
                </button>
              </div>
              <PurchaseDetail
                key={selected.id}
                item={selected}
                household={household}
                onClose={() => setSelectedId(null)}
              />
            </>
          ) : (
            <p className="text-sm text-sub">準備品を選ぶと、ここに詳細が出ます。</p>
          )}
        </aside>
      )}

      {!wide && selected && (
        <PurchaseSheet
          key={selected.id}
          item={selected}
          household={household}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ItemRow({ item, household, onOpen }: {
  item: PurchaseItem;
  household: Household;
  onOpen: () => void;
}) {
  const { notify } = useToast();
  const householdId = household.id;
  const done = item.status === 'done';
  const skipped = item.status === 'skipped';
  const due = purchaseDueDate(item, household.dueDate, household.birthDate);
  return (
    // 「不要」は薄さだけでは伝わらない（読み込み中と区別できない）のでラベルで示す
    <li className={`rounded-2xl bg-white p-4 border border-ink/10 ${skipped ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => {
            void updateItem(householdId, item.id, { status: e.target.checked ? 'done' : 'todo' })
              .catch((error: unknown) => notify(describeWriteError(error)));
          }}
          aria-label={`${item.name}を準備済みにする`}
          className="mt-1 h-5 w-5"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium text-ink ${done ? 'line-through opacity-60' : ''}`}>
            {item.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-sub">
            {skipped && (
              <span className="rounded bg-surface px-1.5 py-0.5 font-bold text-ink">不要にした</span>
            )}
            <span className="rounded bg-base px-1.5 py-0.5">{METHOD_LABEL[item.method]}</span>
            {item.budget != null && <span>予算¥{item.budget.toLocaleString()}</span>}
            {item.waitUntilBorn && (
              <span className="rounded bg-sub/15 px-1.5 py-0.5 text-sub">産後に様子見て</span>
            )}
            {item.assignee && (
              <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-accent">
                {assigneeLabel(item.assignee, household)}
              </span>
            )}
          </p>
          {item.memo && <p className="mt-1 text-xs text-sub">{item.memo}</p>}
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
              onClick={() => {
                void updateItem(householdId, item.id, { status: 'skipped' })
                  .catch((error: unknown) => notify(describeWriteError(error)));
              }}
              className="flex min-h-11 items-center px-2.5 text-xs text-sub hover:text-ink"
            >
              不要
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${item.name}を編集`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-ink/10 text-sub hover:border-ink/35 hover:text-ink"
          >
            <Pencil size={15} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </div>
      {due && <p className="mt-2 pl-8 text-xs text-sub">必要日 {due}</p>}
      {done && (
        <label className="mt-2 block pl-8 text-xs text-sub">
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
  return (
    <Sheet title="準備品を編集" onClose={onClose}>
      <PurchaseDetail item={item} household={household} onClose={onClose} />
    </Sheet>
  );
}

/** シートと右ペインで共有する中身。枠は呼び出し側が用意する */
function PurchaseDetail({ item, household, onClose }: {
  item: PurchaseItem;
  household: Household;
  onClose: () => void;
}) {
  const { notify, notifyWithAction } = useToast();
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

  const save = (): void => {
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
      // ローカルキャッシュへの反映後は閉じ、サーバー応答待ちでオフラインUIを止めない。
      const pendingWrite = updateItemDetails(household.id, item.id, {
        name: name.trim(),
        category,
        method,
        budget: parsedBudget,
        actualCost: parsedActualCost,
        neededByDateOverride: overrideDate,
        userMemo,
      });
      onClose();
      void pendingWrite.catch((error: unknown) => notify(describeWriteError(error)));
    } catch {
      setError('準備品の変更を保存できませんでした。');
      setSaving(false);
    }
  };

  const setStatus = (status: PurchaseItem['status']): void => {
    setError(null);
    void updateItem(household.id, item.id, { status })
      .catch((error: unknown) => setError(describeWriteError(error)));
  };

  return (
    <>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-bold text-sub">
            品名
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold text-sub">
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
            <label className="block text-xs font-bold text-sub">
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
          <label className="block text-xs font-bold text-sub">
            必要日
            <input
              type="date"
              value={neededDate}
              min={TASK_DATE_BOUNDS.min}
              max={TASK_DATE_BOUNDS.max}
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
            <p className="rounded-xl bg-base p-3 text-xs leading-relaxed text-sub">
              {item.memo}
            </p>
          )}
          <label className="block text-xs font-bold text-sub">
            家庭メモ
            <textarea
              value={userMemo}
              onChange={(event) => setUserMemo(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-3 py-2.5 text-sm font-normal text-ink"
            />
          </label>
        </div>

        <p className="mt-5 text-xs font-bold text-sub">状態</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {([
            ['todo', '未準備'], ['done', '準備済み'], ['skipped', '不要'],
          ] as const).map(([status, label]) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatus(status)}
              className={`rounded-full py-2 text-sm font-medium ${
                item.status === status ? 'bg-accent hover:bg-ink/85 text-white' : 'bg-base text-sub hover:bg-surface hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs font-bold text-sub">担当</p>
        <div className="mt-1.5 flex gap-2">
          {ASSIGNEE_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                void updateItem(household.id, item.id, { assignee: value })
                  .catch((cause: unknown) => setError(describeWriteError(cause)));
              }}
              className={`flex-1 rounded-full py-2 text-sm ${
                item.assignee === value
                  ? 'bg-surface font-bold text-accent'
                  : 'bg-base text-sub hover:bg-surface hover:text-ink'
              }`}
            >
              {assigneeLabel(value, household)}
            </button>
          ))}
          {item.assignee && (
            <button
              type="button"
              onClick={() => {
                void clearItemAssignee(household.id, item.id)
                  .catch((cause: unknown) => setError(describeWriteError(cause)));
              }}
              className="rounded-full bg-base px-3 py-2 text-sm text-sub hover:bg-surface hover:text-ink"
            >
              解除
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-alert">{error}</p>}
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={save}
          className="mt-5 w-full rounded-full bg-accent hover:bg-ink/85 py-3 font-bold text-white disabled:opacity-40"
        >
          {saving ? '保存中…' : '変更を保存'}
        </button>
        <button
          type="button"
          onClick={async () => {
            // 確認より取り消しの方が速い。先に消してから取り消し口を出す
            const snapshot = item;
            onClose();
            try {
              await removeItem(household.id, item.id);
              notifyWithAction(`「${snapshot.name}」を削除しました`, {
                label: '取り消す',
                run: () => {
                  void restoreItem(household.id, snapshot)
                    .catch((error: unknown) => notify(describeWriteError(error)));
                },
              });
            } catch (error: unknown) {
              notify(describeWriteError(error));
            }
          }}
          className="mt-3 w-full rounded-full bg-alert/10 py-2.5 text-sm font-bold text-alert hover:bg-alert/20"
        >
          準備品を削除
        </button>
    </>
  );
}

function NumberField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold text-sub">
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
