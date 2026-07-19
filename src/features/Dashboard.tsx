import type { Household, TaskInstance, PurchaseItem } from '../types';
import { pregnancyWeek, daysUntilDue, urgency, todayYmd, diffDays } from '../lib/deadline';
import weeklyInfo from '../data/weekly-info.json';

export default function Dashboard({
  household, tasks, items, onGoTasks,
}: {
  household: Household;
  tasks: TaskInstance[];
  items: PurchaseItem[];
  onGoTasks: () => void;
}) {
  const today = todayYmd();
  const born = !!household.birthDate;
  const { week, day } = pregnancyWeek(household.dueDate, today);
  const remaining = daysUntilDue(household.dueDate, today);

  const active = tasks.filter((t) => t.status === 'todo' || t.status === 'doing');
  const overdue = active.filter((t) => urgency(t.dueDateResolved, today) === 'overdue');
  const imminent = active
    .filter((t) => urgency(t.dueDateResolved, today) === 'imminent')
    .sort((a, b) => (a.dueDateResolved! < b.dueDateResolved! ? -1 : 1));
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const naCount = tasks.filter((t) => t.status === 'na').length;
  const progress = tasks.length - naCount > 0
    ? Math.round((doneCount / (tasks.length - naCount)) * 100) : 0;

  const budget = items.filter((i) => i.status !== 'skipped')
    .reduce((s, i) => s + (i.budget ?? 0), 0);
  const spent = items.filter((i) => i.status === 'done')
    .reduce((s, i) => s + (i.actualCost ?? i.budget ?? 0), 0);

  return (
    <div className="space-y-6 px-5 pt-8">
      {/* 週数スタンプカード（シグネチャ要素） */}
      <section className="rounded-2xl border border-ink bg-white p-1.5">
        <div className="rounded-xl border border-ink/15 px-6 py-7 text-center">
          <p className="text-xs tracking-[0.3em] text-sub">{household.name}</p>
          {born ? (
            <>
              <p className="mt-3 font-display text-2xl font-bold text-ink">
                生後 {diffDays(household.birthDate!, today)} 日
              </p>
              <p className="mt-1 text-sm text-ink/60">出生日 {household.birthDate}</p>
            </>
          ) : (
            <>
              <p className="mt-3 font-display text-4xl font-bold leading-none text-ink">
                {week}
                <span className="text-xl">週</span> {day}
                <span className="text-xl">日</span>
              </p>
              <p className="mt-2 text-sm text-ink/60">
                予定日 {household.dueDate} まで{' '}
                <span className="font-display text-lg font-bold text-accent">
                  {remaining >= 0 ? `あと${remaining}日` : `${-remaining}日経過`}
                </span>
              </p>
            </>
          )}
        </div>
      </section>

      {!born && <WeekInfoCard week={week} />}

      {overdue.length > 0 && (
        <section className="rounded-2xl bg-alert/10 p-4">
          <h2 className="font-display font-bold text-alert">期限を過ぎています</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {overdue.map((t) => (
              <li key={t.id}>・{t.title}（{t.dueDateResolved}）</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-bold text-ink">今週やること</h2>
          <button onClick={onGoTasks} className="text-sm text-accent">すべて見る →</button>
        </div>
        {imminent.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-5 text-sm text-ink/60">
            7日以内の期限はありません。ひと息つきましょう。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {imminent.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-2xl bg-white p-4 border border-ink/10">
                <div>
                  <p className="font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-ink/50">
                    {t.dueDateResolved}まで
                    {t.deadline === 'hard' && (
                      <span className="ml-1 rounded bg-alert/10 px-1.5 py-0.5 text-alert">法定</span>
                    )}
                  </p>
                </div>
                <AssigneeBadge assignee={t.assignee} names={household} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-ink/10">
          <p className="text-xs text-ink/50">タスク進捗</p>
          <p className="mt-1 font-display text-2xl font-bold text-accent">{progress}%</p>
          <div className="mt-2 h-1.5 rounded-full bg-base">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-ink/10">
          <p className="text-xs text-ink/50">準備品の予算</p>
          <p className="mt-1 font-display text-2xl font-bold text-sub">
            ¥{spent.toLocaleString()}
          </p>
          <p className="text-xs text-ink/50">/ ¥{budget.toLocaleString()}</p>
        </div>
      </section>
    </div>
  );
}

export function AssigneeBadge({
  assignee, names,
}: { assignee?: 'partner1' | 'partner2' | 'both'; names: Household }) {
  if (!assignee) return null;
  const [u1, u2] = names.memberUids;
  const label =
    assignee === 'both' ? 'ふたり'
    : assignee === 'partner1' ? names.memberNames[u1] ?? 'メンバー1'
    : names.memberNames[u2] ?? 'メンバー2';
  return (
    <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-accent">
      {label}
    </span>
  );
}

function WeekInfoCard({ week }: { week: number }) {
  const info = (weeklyInfo.weeks as {
    week: number; babySize: string; babyNote: string; momNote: string;
  }[]).find((w) => w.week === week);
  if (!info) return null;
  return (
    <section className="rounded-2xl bg-white p-5 border border-ink/10">
      <h2 className="font-display font-bold text-ink">
        今週の赤ちゃん <span className="text-sm font-normal text-ink/50">目安 {info.babySize}</span>
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/80">{info.babyNote}</p>
      <p className="mt-2 rounded-xl bg-surface p-3 text-sm leading-relaxed text-accent">
        {info.momNote}
      </p>
      <p className="mt-2 text-[10px] text-ink/40">
        一般的な目安です。体調・検査はかかりつけ医の指示を優先してください
      </p>
    </section>
  );
}
