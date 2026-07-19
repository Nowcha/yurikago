import { useEffect, useMemo, useState } from 'react';
import {
  Milk, Droplets, CircleDot, Moon, Sun, Bath, Thermometer, Scale, StickyNote, X,
} from 'lucide-react';
import type { Household, CareRecord, CareRecordType } from '../types';
import { addRecord, removeRecord } from '../lib/store';

const TYPE_META: Record<CareRecordType, { label: string; needsValue?: 'ml' | 'temp' | 'weight' | 'text' }> = {
  breast_l: { label: '母乳 左' },
  breast_r: { label: '母乳 右' },
  formula: { label: 'ミルク', needsValue: 'ml' },
  pump: { label: '搾乳', needsValue: 'ml' },
  pee: { label: 'おしっこ' },
  poop: { label: 'うんち' },
  sleep: { label: 'ねた' },
  wake: { label: 'おきた' },
  bath: { label: '沐浴' },
  temp: { label: '体温', needsValue: 'temp' },
  weight: { label: '体重', needsValue: 'weight' },
  memo: { label: 'メモ', needsValue: 'text' },
};

const FEEDING: CareRecordType[] = ['breast_l', 'breast_r', 'formula'];

export default function Records({ household, records, uid }: {
  household: Household; records: CareRecord[]; uid: string;
}) {
  const [pending, setPending] = useState<CareRecordType | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000); // 経過時間表示の更新
    return () => clearInterval(t);
  }, []);

  const lastFeeding = useMemo(
    () => records.find((r) => FEEDING.includes(r.type)),
    [records],
  );
  const lastSleepState = useMemo(
    () => records.find((r) => r.type === 'sleep' || r.type === 'wake'),
    [records],
  );
  const sleeping = lastSleepState?.type === 'sleep';

  const quickAdd = (type: CareRecordType) => {
    if (TYPE_META[type].needsValue) {
      setPending(type);
    } else {
      addRecord(household.id, { type, at: Date.now(), by: uid });
    }
  };

  return (
    <div className="px-5 pt-8">
      <h1 className="font-display text-xl font-bold text-ink">きろく</h1>

      {/* 経過時間の常時表示 */}
      <div className="mt-3 rounded-2xl border border-ink bg-white p-1.5">
        <div className="rounded-xl border border-ink/15 px-5 py-4 text-center">
          <p className="text-xs text-sub">前回の授乳から</p>
          <p className="mt-1 font-display text-3xl font-bold text-ink">
            {lastFeeding ? elapsed(lastFeeding.at) : '記録なし'}
          </p>
          {sleeping && (
            <p className="mt-1 text-xs text-sub">
              ねんね中（{elapsed(lastSleepState!.at)}経過）
            </p>
          )}
        </div>
      </div>

      {/* ワンタップ記録グリッド */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <QuickBtn icon={Milk} label="母乳 左" onTap={() => quickAdd('breast_l')} />
        <QuickBtn icon={Milk} label="母乳 右" onTap={() => quickAdd('breast_r')} />
        <QuickBtn icon={Milk} label="ミルク" onTap={() => quickAdd('formula')} />
        <QuickBtn icon={Droplets} label="おしっこ" onTap={() => quickAdd('pee')} />
        <QuickBtn icon={CircleDot} label="うんち" onTap={() => quickAdd('poop')} />
        <QuickBtn icon={Milk} label="搾乳" onTap={() => quickAdd('pump')} />
        {sleeping ? (
          <QuickBtn icon={Sun} label="おきた" onTap={() => quickAdd('wake')} emph />
        ) : (
          <QuickBtn icon={Moon} label="ねた" onTap={() => quickAdd('sleep')} emph />
        )}
        <QuickBtn icon={Bath} label="沐浴" onTap={() => quickAdd('bath')} />
        <QuickBtn icon={Thermometer} label="体温" onTap={() => quickAdd('temp')} />
        <QuickBtn icon={Scale} label="体重" onTap={() => quickAdd('weight')} />
        <QuickBtn icon={StickyNote} label="メモ" onTap={() => quickAdd('memo')} />
      </div>

      {/* 当日のタイムライン */}
      <DayLog household={household} records={records} />

      {pending && (
        <ValueSheet
          type={pending}
          onClose={() => setPending(null)}
          onSave={(payload) => {
            addRecord(household.id, { type: pending, at: Date.now(), by: uid, ...payload });
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

function QuickBtn({ icon: Icon, label, onTap, emph }: {
  icon: typeof Milk; label: string; onTap: () => void; emph?: boolean;
}) {
  return (
    <button
      onClick={onTap}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border py-4 text-xs font-medium active:scale-95 ${
        emph ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink'
      }`}
    >
      <Icon size={22} strokeWidth={1.6} aria-hidden />
      {label}
    </button>
  );
}

function DayLog({ household, records }: { household: Household; records: CareRecord[] }) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = records.filter((r) => r.at >= dayStart.getTime());

  return (
    <section className="mt-7">
      <h2 className="text-sm font-bold text-sub">きょうの記録（{today.length}件）</h2>
      <ul className="mt-2 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
        {today.length === 0 && (
          <li className="p-4 text-sm text-sub">まだ記録がありません</li>
        )}
        {today.map((r) => (
          <li key={r.id} className="flex items-center justify-between p-3.5">
            <div className="flex items-baseline gap-3">
              <span className="w-11 font-mono text-xs text-sub">{hhmm(r.at)}</span>
              <span className="text-sm font-medium text-ink">{TYPE_META[r.type].label}</span>
              <span className="text-xs text-sub">
                {r.amountMl != null && `${r.amountMl}ml`}
                {r.temperature != null && `${r.temperature.toFixed(1)}℃`}
                {r.weightG != null && `${r.weightG}g`}
                {r.note}
              </span>
            </div>
            <button
              onClick={() => {
                if (confirm(`${hhmm(r.at)} の「${TYPE_META[r.type].label}」を削除しますか？`)) {
                  removeRecord(household.id, r.id);
                }
              }}
              className="p-1 text-ink/30"
              aria-label="削除"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ValueSheet({ type, onSave, onClose }: {
  type: CareRecordType;
  onSave: (p: Partial<CareRecord>) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const kind = TYPE_META[type].needsValue!;
  const config = {
    ml: { label: 'ミルク量（ml）', input: 'number', placeholder: '80' },
    temp: { label: '体温（℃）', input: 'number', placeholder: '36.8' },
    weight: { label: '体重（g）', input: 'number', placeholder: '3200' },
    text: { label: 'メモ', input: 'text', placeholder: '' },
  }[kind];

  const save = () => {
    if (!value.trim()) return;
    if (kind === 'ml') onSave({ amountMl: Number(value) });
    else if (kind === 'temp') onSave({ temperature: Number(value) });
    else if (kind === 'weight') onSave({ weightG: Number(value) });
    else onSave({ note: value.trim() });
  };

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
        <p className="font-display font-bold text-ink">
          {TYPE_META[type].label} — {config.label}
        </p>
        <input
          autoFocus
          type={config.input}
          inputMode={kind === 'text' ? 'text' : 'decimal'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={config.placeholder}
          className="mt-3 w-full rounded-xl border border-ink/15 bg-base px-4 py-3.5 text-lg"
        />
        <button
          onClick={save}
          disabled={!value.trim()}
          className="mt-4 w-full rounded-full bg-accent py-3.5 font-display font-bold text-white disabled:opacity-40"
        >
          記録する
        </button>
      </div>
    </div>
  );
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function elapsed(ms: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}
