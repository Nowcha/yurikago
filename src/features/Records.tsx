import { useEffect, useMemo, useState } from 'react';
import {
  Heart, Milk, Droplets, Droplet, Baby, Moon, Sun, Bath, Thermometer, Scale,
  StickyNote, X, Pencil, ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react';
import type { Household, CareRecord, CareRecordType } from '../types';
import { addRecord, removeRecord, replaceRecord, watchRecordsForDay } from '../lib/store';
import { parsePositiveMeasurement, summarizeCareDay } from '../lib/records';
import { addDays, todayYmd } from '../lib/deadline';

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
  const [selectedDay, setSelectedDay] = useState(todayYmd());
  const [dayRecords, setDayRecords] = useState<CareRecord[]>([]);
  const [dayLoading, setDayLoading] = useState(true);
  const [dayError, setDayError] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000); // 経過時間表示の更新
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setDayLoading(true);
    setDayError(false);
    return watchRecordsForDay(
      household.id,
      selectedDay,
      (nextRecords) => {
        setDayRecords(nextRecords);
        setDayLoading(false);
      },
      () => {
        setDayRecords([]);
        setDayError(true);
        setDayLoading(false);
      },
    );
  }, [household.id, selectedDay]);

  const lastFeeding = useMemo(
    () => records.find((r) => FEEDING.includes(r.type)),
    [records],
  );
  const lastSleepState = useMemo(
    () => records.find((r) => r.type === 'sleep' || r.type === 'wake'),
    [records],
  );
  const sleeping = lastSleepState?.type === 'sleep';

  const enqueueRecord = (record: Omit<CareRecord, 'id'>): boolean => {
    setRecordError(null);
    try {
      // FirestoreのPromiseはサーバー反映まで完了しないため、オフライン操作では待たない。
      const pendingWrite = addRecord(household.id, record);
      void pendingWrite.catch(() => {
        setRecordError('記録を同期できませんでした。通信状態を確認してください。');
      });
      return true;
    } catch {
      setRecordError('記録を保存できませんでした。もう一度お試しください。');
      return false;
    }
  };

  const quickAdd = (type: CareRecordType): void => {
    if (TYPE_META[type].needsValue) {
      setPending(type);
      return;
    }
    enqueueRecord({ type, at: Date.now(), by: uid });
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
        <QuickBtn icon={Heart} label="母乳 左" onTap={() => quickAdd('breast_l')} />
        <QuickBtn icon={Heart} label="母乳 右" onTap={() => quickAdd('breast_r')} />
        <QuickBtn icon={Milk} label="ミルク" onTap={() => quickAdd('formula')} />
        <QuickBtn icon={Droplet} label="おしっこ" onTap={() => quickAdd('pee')} />
        <QuickBtn icon={Baby} label="うんち" onTap={() => quickAdd('poop')} />
        <QuickBtn icon={Droplets} label="搾乳" onTap={() => quickAdd('pump')} />
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
      {recordError && <p className="mt-3 text-sm text-alert">{recordError}</p>}

      <div className="mt-7 flex items-center gap-2">
        <button
          onClick={() => setSelectedDay((day) => addDays(day, -1))}
          className="rounded-full border border-ink/10 bg-white p-2.5 text-ink/60"
          aria-label="前の日"
        >
          <ChevronLeft size={18} />
        </button>
        <input
          type="date"
          value={selectedDay}
          max={todayYmd()}
          onChange={(event) => {
            if (event.target.value) setSelectedDay(event.target.value);
          }}
          className="min-w-0 flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-center text-sm text-ink"
          aria-label="表示する日"
        />
        <button
          disabled={selectedDay >= todayYmd()}
          onClick={() => setSelectedDay((day) => addDays(day, 1))}
          className="rounded-full border border-ink/10 bg-white p-2.5 text-ink/60 disabled:opacity-30"
          aria-label="次の日"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <DayLog
        household={household}
        records={dayRecords}
        selectedDay={selectedDay}
        loading={dayLoading}
        hasError={dayError}
      />

      {pending && (
        <ValueSheet
          type={pending}
          onClose={() => setPending(null)}
          onSave={(payload) => enqueueRecord({
            type: pending,
            at: Date.now(),
            by: uid,
            ...payload,
          })}
        />
      )}
    </div>
  );
}

function QuickBtn({ icon: Icon, label, onTap, emph }: {
  icon: LucideIcon; label: string; onTap: () => void; emph?: boolean;
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

function DayLog({ household, records, selectedDay, loading, hasError }: {
  household: Household;
  records: CareRecord[];
  selectedDay: string;
  loading: boolean;
  hasError: boolean;
}) {
  const [editing, setEditing] = useState<CareRecord | null>(null);
  const heading = selectedDay === todayYmd() ? 'きょうの記録' : `${selectedDay} の記録`;

  return (
    <section className="mt-7">
      <h2 className="text-sm font-bold text-sub">{heading}（{records.length}件）</h2>
      {!loading && !hasError && records.length > 0 && <DaySummary records={records} />}
      <ul className="mt-2 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
        {loading && <li className="p-4 text-sm text-sub">読み込み中…</li>}
        {!loading && hasError && (
          <li className="p-4 text-sm text-alert">この日の記録を読み込めませんでした</li>
        )}
        {!loading && !hasError && records.length === 0 && (
          <li className="p-4 text-sm text-sub">まだ記録がありません</li>
        )}
        {!loading && !hasError && records.map((r) => (
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing(r)}
                className="p-1.5 text-ink/40"
                aria-label="編集"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={async () => {
                  if (confirm(`${hhmm(r.at)} の「${TYPE_META[r.type].label}」を削除しますか？`)) {
                    try {
                      await removeRecord(household.id, r.id);
                    } catch {
                      alert('記録を削除できませんでした');
                    }
                  }
                }}
                className="p-1.5 text-ink/30"
                aria-label="削除"
              >
                <X size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <RecordEditSheet
          record={editing}
          householdId={household.id}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function DaySummary({ records }: { records: CareRecord[] }) {
  const summary = summarizeCareDay(records);
  const rows = [
    ['授乳記録', `${summary.feedingCount}回`],
    ['ミルク', `${summary.formulaMl}ml`],
    ['おしっこ', `${summary.peeCount}回`],
    ['うんち', `${summary.poopCount}回`],
  ];
  return (
    <dl className="mt-2 grid grid-cols-4 divide-x divide-ink/10 rounded-xl border border-ink/10 bg-white py-3 text-center">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0 px-1">
          <dt className="truncate text-[10px] text-ink/45">{label}</dt>
          <dd className="mt-0.5 font-display text-sm font-bold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecordEditSheet({ record, householdId, onClose }: {
  record: CareRecord;
  householdId: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<CareRecordType>(record.type);
  const [at, setAt] = useState(toDateTimeLocal(record.at));
  const [value, setValue] = useState(recordValue(record));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = TYPE_META[type].needsValue;

  const save = (): void => {
    if (!at || (kind && !value.trim())) return;
    const timestamp = new Date(at).getTime();
    if (!Number.isFinite(timestamp)) return;
    const measurement = kind && kind !== 'text' ? parsePositiveMeasurement(value) : null;
    if (kind && kind !== 'text' && measurement == null) {
      setError('0より大きい数値を入力してください。');
      return;
    }
    const next: CareRecord = { id: record.id, type, at: timestamp };
    if (record.by) next.by = record.by;
    if (kind === 'ml' && measurement != null) next.amountMl = measurement;
    else if (kind === 'temp' && measurement != null) next.temperature = measurement;
    else if (kind === 'weight' && measurement != null) next.weightG = measurement;
    else if (kind === 'text') next.note = value.trim();

    setSaving(true);
    setError(null);
    try {
      const pendingWrite = replaceRecord(householdId, next);
      onClose();
      void pendingWrite.catch(() => alert('記録を同期できませんでした'));
    } catch {
      setError('記録を保存できませんでした。');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-6 pb-10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
        <p className="font-display font-bold text-ink">記録を編集</p>
        <label className="mt-3 block text-xs font-bold text-ink/50">
          種類
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as CareRecordType);
              setValue('');
            }}
            className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-4 py-3 text-sm font-normal text-ink"
          >
            {Object.entries(TYPE_META).map(([valueKey, meta]) => (
              <option key={valueKey} value={valueKey}>{meta.label}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs font-bold text-ink/50">
          日時
          <input
            type="datetime-local"
            value={at}
            onChange={(event) => setAt(event.target.value)}
            className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-4 py-3 text-sm font-normal text-ink"
          />
        </label>
        {kind && (
          <label className="mt-3 block text-xs font-bold text-ink/50">
            {kind === 'ml' ? '量（ml）' : kind === 'temp' ? '体温（℃）' : kind === 'weight' ? '体重（g）' : 'メモ'}
            <input
              type={kind === 'text' ? 'text' : 'number'}
              inputMode={kind === 'text' ? 'text' : 'decimal'}
              min={kind === 'text' ? undefined : '0.1'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-4 py-3 text-sm font-normal text-ink"
            />
          </label>
        )}
        {error && <p className="mt-3 text-sm text-alert">{error}</p>}
        <button
          disabled={saving || !at || Boolean(kind && !value.trim())}
          onClick={save}
          className="mt-4 w-full rounded-full bg-accent py-3.5 font-display font-bold text-white disabled:opacity-40"
        >
          {saving ? '保存中…' : '変更を保存'}
        </button>
      </div>
    </div>
  );
}

function ValueSheet({ type, onSave, onClose }: {
  type: CareRecordType;
  onSave: (p: Partial<CareRecord>) => boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const kind = TYPE_META[type].needsValue!;
  const config = {
    ml: { label: 'ミルク量（ml）', input: 'number', placeholder: '80' },
    temp: { label: '体温（℃）', input: 'number', placeholder: '36.8' },
    weight: { label: '体重（g）', input: 'number', placeholder: '3200' },
    text: { label: 'メモ', input: 'text', placeholder: '' },
  }[kind];

  const save = (): void => {
    if (!value.trim()) return;
    const payload: Partial<CareRecord> = {};
    if (kind === 'text') {
      payload.note = value.trim();
    } else {
      const measurement = parsePositiveMeasurement(value);
      if (measurement == null) {
        setError('0より大きい数値を入力してください。');
        return;
      }
      if (kind === 'ml') payload.amountMl = measurement;
      else if (kind === 'temp') payload.temperature = measurement;
      else payload.weightG = measurement;
    }
    setError(null);
    if (onSave(payload)) {
      onClose();
    } else {
      setError('記録を保存できませんでした。');
    }
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
          min={kind === 'text' ? undefined : '0.1'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          placeholder={config.placeholder}
          className="mt-3 w-full rounded-xl border border-ink/15 bg-base px-4 py-3.5 text-lg"
        />
        {error && <p className="mt-3 text-sm text-alert">{error}</p>}
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

function toDateTimeLocal(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function recordValue(record: CareRecord): string {
  if (record.amountMl != null) return String(record.amountMl);
  if (record.temperature != null) return String(record.temperature);
  if (record.weightG != null) return String(record.weightG);
  return record.note ?? '';
}

function elapsed(ms: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}
