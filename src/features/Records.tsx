import { useEffect, useMemo, useState } from 'react';
import {
  Heart, Milk, GlassWater, Droplets, Droplet, Baby, Moon, Sun, Bath, Thermometer, Scale,
  StickyNote, Pill, Syringe, X, Pencil, ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react';
import type { Household, CareRecord, CareRecordType } from '../types';
import {
  addRecord, removeRecord, replaceRecord, setBreastMlPerMin, watchRecordsForDay,
} from '../lib/store';
import Sheet from '../components/Sheet';
import FeedingVolumeChart from '../components/FeedingVolumeChart';
import { useToast } from '../components/Toast';
import { describeWriteError } from '../lib/sync';
import {
  buildSleepIntervals, findLastFeeding, parsePositiveMeasurement, summarizeCareDay, type CareDayWindow,
} from '../lib/records';
import { addDays, todayYmd } from '../lib/deadline';
import {
  buildDailyVolumes, DEFAULT_BREAST_ML_PER_MIN, resolveBreastMlPerMin, summarizeFeedingVolume,
} from '../lib/feedingVolume';
import {
  calcMilkPlan, MILK_FEEDINGS_PER_DAY, MILK_ML_PER_KG_MAX, MILK_ML_PER_KG_MIN,
} from '../lib/milk';

const TYPE_META: Record<CareRecordType, { label: string; needsValue?: 'ml' | 'temp' | 'weight' | 'text' }> = {
  breast_l: { label: '母乳 左' },
  breast_r: { label: '母乳 右' },
  formula: { label: 'ミルク', needsValue: 'ml' },
  expressed: { label: '搾母乳', needsValue: 'ml' },
  pump: { label: '搾乳', needsValue: 'ml' },
  pee: { label: 'おしっこ' },
  poop: { label: 'うんち' },
  sleep: { label: 'ねた' },
  wake: { label: 'おきた' },
  bath: { label: '沐浴' },
  temp: { label: '体温', needsValue: 'temp' },
  weight: { label: '体重', needsValue: 'weight' },
  medicine: { label: '服薬', needsValue: 'text' },
  vaccine: { label: '予防接種', needsValue: 'text' },
  memo: { label: 'メモ', needsValue: 'text' },
};

export default function Records({ household, records, uid }: {
  household: Household; records: CareRecord[]; uid: string;
}) {
  const [pending, setPending] = useState<CareRecordType | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayYmd());
  const [dayRecords, setDayRecords] = useState<CareRecord[]>([]);
  const [dayContextRecords, setDayContextRecords] = useState<CareRecord[]>([]);
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
        const { startAt, endAt } = careDayWindow(selectedDay);
        setDayContextRecords(nextRecords);
        setDayRecords(nextRecords.filter((record) => record.at >= startAt && record.at < endAt));
        setDayLoading(false);
      },
      () => {
        setDayRecords([]);
        setDayContextRecords([]);
        setDayError(true);
        setDayLoading(false);
      },
    );
  }, [household.id, selectedDay]);

  const lastFeeding = useMemo(
    () => findLastFeeding(records),
    [records],
  );
  const lastSleepState = useMemo(
    () => records.find((r) => r.type === 'sleep' || r.type === 'wake'),
    [records],
  );
  const sleeping = lastSleepState?.type === 'sleep';
  const latestWeightG = useMemo(
    () => records.find((r) => r.type === 'weight' && r.weightG != null)?.weightG,
    [records],
  );

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
    <div className="mx-auto w-full max-w-md px-5 pt-8 md:max-w-xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
      <h1 className="font-display text-xl font-bold text-ink">きろく</h1>

      {/* PCでは入力（左）と当日のログ（右）を並べ、記録するたびに縦へ流れないようにする */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div>
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
      <div className="mt-5 grid grid-cols-3 gap-2.5 md:grid-cols-4 lg:grid-cols-3">
        <QuickBtn icon={Heart} label="母乳 左" onTap={() => quickAdd('breast_l')} />
        <QuickBtn icon={Heart} label="母乳 右" onTap={() => quickAdd('breast_r')} />
        <QuickBtn icon={Milk} label="ミルク" onTap={() => quickAdd('formula')} />
        <QuickBtn icon={GlassWater} label="搾母乳" onTap={() => quickAdd('expressed')} />
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
        <QuickBtn icon={Pill} label="服薬" onTap={() => quickAdd('medicine')} />
        <QuickBtn icon={Syringe} label="予防接種" onTap={() => quickAdd('vaccine')} />
        <QuickBtn icon={StickyNote} label="メモ" onTap={() => quickAdd('memo')} />
      </div>
      {recordError && <p className="mt-3 text-sm text-alert">{recordError}</p>}

      <div className="mt-7 flex items-center gap-2">
        <button
          onClick={() => setSelectedDay((day) => addDays(day, -1))}
          className="rounded-full border border-ink/10 hover:bg-surface bg-white p-2.5 text-sub"
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
          className="min-w-0 flex-1 rounded-full border border-ink/10 hover:bg-surface bg-white px-4 py-2.5 text-center text-sm text-ink"
          aria-label="表示する日"
        />
        <button
          disabled={selectedDay >= todayYmd()}
          onClick={() => setSelectedDay((day) => addDays(day, 1))}
          className="rounded-full border border-ink/10 hover:bg-surface bg-white p-2.5 text-sub disabled:opacity-30"
          aria-label="次の日"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <VolumeTrend household={household} records={records} />

      <MilkCalculator latestWeightG={latestWeightG} />

      </div>

      <div>
      <DayLog
        household={household}
        records={dayRecords}
        contextRecords={dayContextRecords}
        selectedDay={selectedDay}
        loading={dayLoading}
        hasError={dayError}
      />
      </div>
      </div>

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

const VOLUME_RANGES = [7, 14, 30] as const;

function VolumeTrend({ household, records }: { household: Household; records: CareRecord[] }) {
  const { notify } = useToast();
  const [range, setRange] = useState<(typeof VOLUME_RANGES)[number]>(7);
  const rate = resolveBreastMlPerMin(household.breastMlPerMin);
  const [rateInput, setRateInput] = useState(String(rate));

  const today = todayYmd();
  // 購読は新しい順に1000件まで。上限に達しているときは、読み込めた最古の日以前は欠けるので出さない
  const loadedFrom = records.length >= 1000
    ? ymdOf(records[records.length - 1].at)
    : null;
  const days = Array.from({ length: range }, (_, i) => addDays(today, i - (range - 1)))
    .filter((day) => loadedFrom == null || day > loadedFrom);
  const volumes = buildDailyVolumes(records, days.map((day) => ({ day, ...careDayWindow(day) })), rate);

  const saveRate = (): void => {
    const next = parsePositiveMeasurement(rateInput);
    if (next == null) {
      setRateInput(String(rate));
      return;
    }
    if (next === rate) return;
    void setBreastMlPerMin(household.id, next).catch((error: unknown) => notify(describeWriteError(error)));
  };

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-sub">のんだ量の推移</h2>
        <div className="flex gap-1" role="group" aria-label="表示する日数">
          {VOLUME_RANGES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRange(n)}
              aria-pressed={range === n}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                range === n ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink hover:bg-surface'
              }`}
            >
              {n}日
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 rounded-2xl border border-ink/10 bg-white p-4">
        <FeedingVolumeChart volumes={volumes} />
        <div className="mt-4 flex items-center gap-2 border-t border-ink/10 pt-3">
          <label htmlFor="breast-ml-per-min" className="text-xs text-sub">母乳の推定：授乳1分あたり</label>
          <input
            id="breast-ml-per-min"
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={saveRate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-16 rounded-lg border border-ink/15 bg-base px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-sub">ml</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-sub">
          母乳は量を測れないため、授乳時間（分）×この値で推定しています（初期値{DEFAULT_BREAST_ML_PER_MIN}ml/分は仮の値）。
          授乳時間が未入力の記録は0として数えます。搾乳（搾っただけ）は含めません。
        </p>
      </div>
    </section>
  );
}

function MilkCalculator({ latestWeightG }: { latestWeightG?: number }) {
  const [weight, setWeight] = useState(
    latestWeightG != null ? String(Math.round(latestWeightG) / 1000) : '',
  );
  const kg = parsePositiveMeasurement(weight);
  const plan = kg != null ? calcMilkPlan(kg) : null;

  return (
    <section className="mt-7">
      <h2 className="text-sm font-bold text-sub">ミルク量の目安</h2>
      <div className="mt-2 rounded-2xl border border-ink/10 bg-white p-4">
        <label className="block text-xs text-sub" htmlFor="milk-weight">体重（kg）</label>
        <input
          id="milk-weight"
          type="number"
          inputMode="decimal"
          min="0.1"
          step="0.01"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="3.2"
          className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-4 py-3 text-lg"
        />
        {latestWeightG != null && (
          <p className="mt-1.5 text-[11px] text-sub">最新の体重記録（{latestWeightG}g）から入力済みです</p>
        )}
        {plan ? (
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink/10 bg-ink/10 text-center">
            <div className="bg-white px-1 py-3">
              <dt className="text-[10px] text-sub">1日の量</dt>
              <dd className="mt-0.5 font-display text-sm font-bold text-ink">
                {plan.dailyMinMl}〜{plan.dailyMaxMl}ml
              </dd>
            </div>
            <div className="bg-white px-1 py-3">
              <dt className="text-[10px] text-sub">1回の量（{MILK_FEEDINGS_PER_DAY}回/日）</dt>
              <dd className="mt-0.5 font-display text-sm font-bold text-ink">
                {plan.perFeedMinMl}〜{plan.perFeedMaxMl}ml
              </dd>
            </div>
          </dl>
        ) : (
          weight.trim() && <p className="mt-3 text-sm text-alert">0より大きい数値を入力してください。</p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-sub">
          体重1kgあたり{MILK_ML_PER_KG_MIN}〜{MILK_ML_PER_KG_MAX}ml/日の目安で計算しています。
          母乳との併用や月齢で適量は変わるため、小児科・助産師の指示を優先してください。
        </p>
      </div>
    </section>
  );
}

function DayLog({ household, records, contextRecords, selectedDay, loading, hasError }: {
  household: Household;
  records: CareRecord[];
  contextRecords: CareRecord[];
  selectedDay: string;
  loading: boolean;
  hasError: boolean;
}) {
  const { notify, notifyWithAction } = useToast();
  const [editing, setEditing] = useState<CareRecord | null>(null);
  const heading = selectedDay === todayYmd() ? 'きょうの記録' : `${selectedDay} の記録`;

  return (
    <section className="mt-7 lg:mt-0">
      <h2 className="text-sm font-bold text-sub">{heading}（{records.length}件）</h2>
      {!loading && !hasError && (
        <>
          <DaySummary records={contextRecords} selectedDay={selectedDay} breastMlPerMin={resolveBreastMlPerMin(household.breastMlPerMin)} />
          <DayTimeline records={contextRecords} selectedDay={selectedDay} />
        </>
      )}
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
                {r.durationMin != null && `${r.durationMin}分`}
                {r.temperature != null && `${r.temperature.toFixed(1)}℃`}
                {r.weightG != null && `${r.weightG}g`}
                {r.note}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing(r)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-sub hover:bg-surface hover:text-ink"
                aria-label="編集"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={async () => {
                  // 寝ぼけて誤操作しやすい画面。確認より取り消しの方が実態に合う
                  try {
                    await removeRecord(household.id, r.id);
                    notifyWithAction(`${hhmm(r.at)} の「${TYPE_META[r.type].label}」を削除しました`, {
                      label: '取り消す',
                      run: () => {
                        void replaceRecord(household.id, r)
                          .catch((error: unknown) => notify(describeWriteError(error)));
                      },
                    });
                  } catch (error: unknown) {
                    notify(describeWriteError(error));
                  }
                }}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-sub hover:bg-alert/10 hover:text-alert"
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

function DaySummary({ records, selectedDay, breastMlPerMin }: {
  records: CareRecord[]; selectedDay: string; breastMlPerMin: number;
}) {
  const window = careDayWindow(selectedDay);
  const summary = summarizeCareDay(records, window);
  const volume = summarizeFeedingVolume(
    records.filter((record) => record.at >= window.startAt && record.at < window.endAt),
    breastMlPerMin,
  );
  const rows = [
    ['授乳', `${summary.feedingCount}回`],
    ['母乳', `${summary.breastMinutes}分`],
    ['ミルク', `${summary.formulaMl}ml`],
    ['搾母乳', `${summary.expressedMl}ml`],
    ['搾乳', `${summary.pumpMl}ml`],
    ['睡眠', formatMinutes(summary.sleepMinutes)],
    ['おしっこ', `${summary.peeCount}回`],
    ['うんち', `${summary.poopCount}回`],
  ];
  return (
    <>
    <dl className="mt-2 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-ink/10 bg-ink/10 text-center">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0 bg-white px-1 py-3">
          <dt className="truncate text-[10px] text-sub">{label}</dt>
          <dd className="mt-0.5 font-display text-sm font-bold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
    <p className="mt-2 rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-xs text-sub">
      のんだ量 合計
      <span className="ml-2 font-display text-sm font-bold text-ink">{volume.totalMl}ml</span>
      <span className="ml-2">
        母乳（推定）{volume.breastMl} + ミルク {volume.formulaMl} + 搾母乳 {volume.expressedMl}
      </span>
    </p>
    </>
  );
}

const TIMELINE_ROWS: { label: string; types: CareRecordType[] }[] = [
  { label: '母乳', types: ['breast_l', 'breast_r'] },
  { label: 'ミルク', types: ['formula'] },
  { label: '搾母乳', types: ['expressed'] },
  { label: 'おしっこ', types: ['pee'] },
  { label: 'うんち', types: ['poop'] },
];
const TIMELINE_HOURS = [0, 6, 12, 18, 24];

/** 1日(0〜24時)を横軸に、授乳・排泄を点、睡眠を帯で並べる。色は使わず墨の濃淡のみ */
function DayTimeline({ records, selectedDay }: { records: CareRecord[]; selectedDay: string }) {
  const window = careDayWindow(selectedDay);
  const span = window.endAt - window.startAt;
  const pct = (at: number): number => Math.min(100, Math.max(0, ((at - window.startAt) / span) * 100));
  const inDay = records.filter((r) => r.at >= window.startAt && r.at < window.endAt);
  const sleeps = buildSleepIntervals(records, window);

  return (
    <div
      role="img"
      aria-label="1日のタイムライン（授乳・排泄・睡眠）"
      className="mt-2 rounded-xl border border-ink/10 bg-white px-3 py-3"
    >
      <div className="grid grid-cols-[3.75rem_1fr] items-center gap-y-1.5">
        {TIMELINE_ROWS.map((row) => (
          <TimelineRow key={row.label} label={row.label}>
            {inDay.filter((r) => row.types.includes(r.type)).map((r) => (
              <span
                key={r.id}
                title={`${hhmm(r.at)} ${TYPE_META[r.type].label}${r.amountMl != null ? ` ${r.amountMl}ml` : ''}`}
                className="absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                style={{ left: `${pct(r.at)}%` }}
              />
            ))}
          </TimelineRow>
        ))}
        <TimelineRow label="睡眠">
          {sleeps.map((s) => (
            <span
              key={s.startAt}
              title={`${hhmm(s.startAt)}〜${hhmm(s.endAt)} 睡眠`}
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-ink/35"
              style={{ left: `${pct(s.startAt)}%`, width: `${Math.max(0.6, pct(s.endAt) - pct(s.startAt))}%` }}
            />
          ))}
        </TimelineRow>
        <span />
        <div className="relative h-4 text-[10px] text-sub">
          {TIMELINE_HOURS.map((h) => (
            <span
              key={h}
              className={`absolute top-0 ${h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {h}時
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-[10px] text-sub">{label}</span>
      <div className="relative h-6 border-y border-ink/10">
        {TIMELINE_HOURS.slice(1, -1).map((h) => (
          <span
            key={h}
            aria-hidden
            className="absolute inset-y-0 border-l border-ink/10"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        {children}
      </div>
    </>
  );
}

function RecordEditSheet({ record, householdId, onClose }: {
  record: CareRecord;
  householdId: string;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const [type, setType] = useState<CareRecordType>(record.type);
  const [at, setAt] = useState(toDateTimeLocal(record.at));
  const [value, setValue] = useState(recordValue(record));
  const [duration, setDuration] = useState(
    record.durationMin == null ? '' : String(record.durationMin),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = TYPE_META[type].needsValue;

  const save = (): void => {
    if (!at || (kind && !value.trim())) return;
    const timestamp = new Date(at).getTime();
    if (!Number.isFinite(timestamp)) return;
    const measurement = kind && kind !== 'text' ? parsePositiveMeasurement(value) : null;
    const isBreastfeeding = type === 'breast_l' || type === 'breast_r';
    const durationMinutes = duration.trim() ? parsePositiveMeasurement(duration) : null;
    if (kind && kind !== 'text' && measurement == null) {
      setError('0より大きい数値を入力してください。');
      return;
    }
    if (isBreastfeeding && duration.trim() && durationMinutes == null) {
      setError('授乳時間は0より大きい数値を入力してください。');
      return;
    }
    const next: CareRecord = { id: record.id, type, at: timestamp };
    if (record.by) next.by = record.by;
    if (kind === 'ml' && measurement != null) next.amountMl = measurement;
    else if (kind === 'temp' && measurement != null) next.temperature = measurement;
    else if (kind === 'weight' && measurement != null) next.weightG = measurement;
    else if (kind === 'text') next.note = value.trim();
    if (isBreastfeeding && durationMinutes != null) next.durationMin = durationMinutes;

    setSaving(true);
    setError(null);
    try {
      const pendingWrite = replaceRecord(householdId, next);
      onClose();
      void pendingWrite.catch((error: unknown) => notify(describeWriteError(error)));
    } catch {
      setError('記録を保存できませんでした。');
      setSaving(false);
    }
  };

  return (
    <Sheet title="記録を編集" onClose={onClose}>
        <label className="mt-3 block text-xs font-bold text-sub">
          種類
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as CareRecordType);
              setValue('');
              setDuration('');
            }}
            className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-4 py-3 text-sm font-normal text-ink"
          >
            {Object.entries(TYPE_META).map(([valueKey, meta]) => (
              <option key={valueKey} value={valueKey}>{meta.label}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs font-bold text-sub">
          日時
          <input
            type="datetime-local"
            value={at}
            onChange={(event) => setAt(event.target.value)}
            className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-4 py-3 text-sm font-normal text-ink"
          />
        </label>
        {kind && (
          <label className="mt-3 block text-xs font-bold text-sub">
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
        {(type === 'breast_l' || type === 'breast_r') && (
          <label className="mt-3 block text-xs font-bold text-sub">
            授乳時間（分・任意）
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-base px-4 py-3 text-sm font-normal text-ink"
            />
          </label>
        )}
        {error && <p className="mt-3 text-sm text-alert">{error}</p>}
        <button
          disabled={saving || !at || Boolean(kind && !value.trim())}
          onClick={save}
          className="mt-4 w-full rounded-full bg-accent hover:bg-ink/85 py-3.5 font-display font-bold text-white disabled:opacity-40"
        >
          {saving ? '保存中…' : '変更を保存'}
        </button>
    </Sheet>
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
    ml: { label: '量（ml）', input: 'number', placeholder: '80' },
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
    <Sheet title={`${TYPE_META[type].label} — ${config.label}`} onClose={onClose}>
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
          className="mt-4 w-full rounded-full bg-accent hover:bg-ink/85 py-3.5 font-display font-bold text-white disabled:opacity-40"
        >
          記録する
        </button>
    </Sheet>
  );
}

function ymdOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function careDayWindow(day: string): CareDayWindow {
  const startAt = new Date(`${day}T00:00:00`).getTime();
  const endDate = new Date(startAt);
  endDate.setDate(endDate.getDate() + 1);
  return { startAt, endAt: endDate.getTime(), nowAt: Date.now() };
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}時間${remainder}分` : `${remainder}分`;
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
