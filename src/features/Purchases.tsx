import { useState } from 'react';
import type { Household, PurchaseItem, PurchaseCategory } from '../types';
import { updateItem, addItem } from '../lib/store';

const CATEGORIES: { id: PurchaseCategory; label: string }[] = [
  { id: 'sleep', label: 'ねんね' },
  { id: 'feeding', label: '授乳・ミルク' },
  { id: 'bath', label: 'おふろ' },
  { id: 'clothing', label: '衣類' },
  { id: 'outing', label: 'おでかけ' },
  { id: 'mom', label: 'ママ用品' },
  { id: 'other', label: 'その他' },
];
const METHOD_LABEL: Record<string, string> = {
  buy: '購入', rental: 'レンタル', handmedown: 'お下がり', gift: 'もらう', undecided: '未定',
};

export default function Purchases({ household, items }: {
  household: Household; items: PurchaseItem[];
}) {
  const [newName, setNewName] = useState('');
  const active = items.filter((i) => i.status !== 'skipped');
  const budget = active.reduce((s, i) => s + (i.budget ?? 0), 0);
  const spent = items.filter((i) => i.status === 'done')
    .reduce((s, i) => s + (i.actualCost ?? i.budget ?? 0), 0);

  return (
    <div className="px-5 pt-8">
      <h1 className="font-display text-xl font-bold text-ink">準備品</h1>
      <div className="mt-3 flex items-baseline gap-3 rounded-2xl bg-white p-4 border border-ink/10">
        <p className="font-display text-2xl font-bold text-sub">¥{spent.toLocaleString()}</p>
        <p className="text-sm text-ink/50">/ 予算 ¥{budget.toLocaleString()}</p>
      </div>

      {CATEGORIES.map((c) => {
        const list = items.filter((i) => i.category === c.id);
        if (list.length === 0) return null;
        return (
          <section key={c.id} className="mt-6">
            <h2 className="text-sm font-bold text-ink/60">{c.label}</h2>
            <ul className="mt-2 space-y-2">
              {list.map((i) => (
                <ItemRow key={i.id} item={i} householdId={household.id} />
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
    </div>
  );
}

function ItemRow({ item, householdId }: { item: PurchaseItem; householdId: string }) {
  const done = item.status === 'done';
  const skipped = item.status === 'skipped';
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
          <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-ink/50">
            <span className="rounded bg-base px-1.5 py-0.5">{METHOD_LABEL[item.method]}</span>
            {item.budget != null && <span>予算¥{item.budget.toLocaleString()}</span>}
            {item.waitUntilBorn && (
              <span className="rounded bg-sub/15 px-1.5 py-0.5 text-sub">産後に様子見て</span>
            )}
          </p>
          {item.memo && <p className="mt-1 text-xs text-ink/50">{item.memo}</p>}
        </div>
        {!skipped && (
          <button
            onClick={() => updateItem(householdId, item.id, { status: 'skipped' })}
            className="text-xs text-ink/40"
          >
            不要
          </button>
        )}
      </div>
      {done && (
        <label className="mt-2 block pl-8 text-xs text-ink/50">
          実費 ¥
          <input
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
