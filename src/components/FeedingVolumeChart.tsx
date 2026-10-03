import { useState } from 'react';
import type { DayVolume } from '../lib/feedingVolume';

const SERIES = [
  { key: 'formulaMl', label: 'ミルク', className: 'bg-ink' },
  { key: 'expressedMl', label: '搾母乳', className: 'bg-ink/50' },
  { key: 'breastMl', label: '母乳（推定）', className: 'bg-ink/20' },
] as const;

const CHART_HEIGHT_PX = 144;

function dayLabel(day: string): string {
  const [, month, date] = day.split('-');
  return `${Number(month)}/${Number(date)}`;
}

/** 日ごとの総量を縦積み棒グラフで見せる。色は使わず墨の濃淡で内訳を分ける */
export default function FeedingVolumeChart({ volumes }: { volumes: DayVolume[] }) {
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const maxMl = Math.max(1, ...volumes.map((v) => v.totalMl));
  const labelEvery = volumes.length > 14 ? 5 : volumes.length > 7 ? 2 : 1;
  const active = volumes.find((v) => v.day === activeDay);

  return (
    <div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-sub" aria-label="凡例">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm border border-ink/10 ${s.className}`} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>

      <div
        className="mt-2 flex items-end gap-1"
        style={{ height: CHART_HEIGHT_PX + 18 }}
        role="img"
        aria-label={`日ごとの母乳・ミルク・搾母乳の量。直近${volumes.length}日、最大${maxMl}ml`}
      >
        {volumes.map((v, index) => (
          <button
            key={v.day}
            type="button"
            onClick={() => setActiveDay(activeDay === v.day ? null : v.day)}
            title={`${dayLabel(v.day)} 合計${v.totalMl}ml（ミルク${v.formulaMl} / 搾母乳${v.expressedMl} / 母乳${v.breastMl}）`}
            className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-sm hover:bg-surface ${
              activeDay === v.day ? 'bg-surface' : ''
            }`}
          >
            <span className="text-[9px] leading-none text-sub">{v.totalMl > 0 ? v.totalMl : ''}</span>
            <span
              className="mt-0.5 flex w-full max-w-6 flex-col justify-end"
              style={{ height: CHART_HEIGHT_PX - 12 }}
            >
              {SERIES.map((s) => (
                <span
                  key={s.key}
                  className={s.className}
                  style={{ height: `${(v[s.key] / maxMl) * 100}%` }}
                />
              ))}
            </span>
            <span className="mt-1 h-3 text-[9px] leading-3 text-sub">
              {index % labelEvery === 0 || index === volumes.length - 1 ? dayLabel(v.day) : ''}
            </span>
          </button>
        ))}
      </div>

      {active && (
        <p className="mt-2 text-xs text-ink">
          {dayLabel(active.day)}：合計 {active.totalMl}ml
          （ミルク {active.formulaMl} / 搾母乳 {active.expressedMl} / 母乳 {active.breastMl}）
        </p>
      )}
    </div>
  );
}
