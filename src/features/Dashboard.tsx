import type { Household, TaskInstance, PurchaseItem } from '../types';
import { pregnancyWeek, daysUntilDue, urgency, todayYmd, diffDays } from '../lib/deadline';
import {
  groupTasksByAssignee, categoryProgress, sprintTasks, type AssigneeGroupKey,
} from '../lib/overview';
import { CATEGORY_LABEL, assigneeLabel } from '../lib/labels';
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

      {born && <SprintSection tasks={tasks} today={today} onGoTasks={onGoTasks} />}

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
          <AssigneeSections tasks={imminent} household={household} />
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

      <CategoryProgressCard tasks={tasks} />
    </div>
  );
}

const ASSIGNEE_SECTION_ORDER: AssigneeGroupKey[] = ['partner1', 'partner2', 'both', 'none'];

function AssigneeSections({ tasks, household }: {
  tasks: TaskInstance[]; household: Household;
}) {
  const groups = groupTasksByAssignee(tasks);
  return (
    <div className="mt-3 space-y-4">
      {ASSIGNEE_SECTION_ORDER.map((key) => {
        const list = groups[key];
        if (list.length === 0) return null;
        return (
          <div key={key}>
            <h3 className="text-xs font-bold tracking-wide text-ink/50">
              {assigneeLabel(key, household)}
            </h3>
            <ul className="mt-1.5 space-y-2">
              {list.map((t) => (
                <li key={t.id} className="rounded-2xl bg-white p-4 border border-ink/10">
                  <p className="font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-ink/50">
                    {t.dueDateResolved}まで
                    {t.deadline === 'hard' && (
                      <span className="ml-1 rounded bg-alert/10 px-1.5 py-0.5 text-alert">法定</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function CategoryProgressCard({ tasks }: { tasks: TaskInstance[] }) {
  const rows = categoryProgress(tasks);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl bg-white p-4 border border-ink/10">
      <p className="text-xs text-ink/50">カテゴリ別進捗</p>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => {
          const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
          return (
            <li key={r.category}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-ink">{CATEGORY_LABEL[r.category]}</span>
                <span className="text-ink/50">{r.done}/{r.total}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-base">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 産後2週間スプリント: 出生日確定後、afterBirthタスクを期限順に消し込むビュー */
function SprintSection({ tasks, today, onGoTasks }: {
  tasks: TaskInstance[]; today: string; onGoTasks: () => void;
}) {
  const sprint = sprintTasks(tasks);
  if (sprint.length === 0) return null;
  const remaining = sprint.filter((t) => t.status === 'todo' || t.status === 'doing');
  return (
    <section className="rounded-2xl border border-ink bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display font-bold text-ink">産後2週間スプリント</h2>
        <button onClick={onGoTasks} className="text-sm text-accent">すべて見る →</button>
      </div>
      <p className="mt-1 text-xs text-ink/50">
        のこり {remaining.length} 件。出生届などの法定期限を最優先で。
      </p>
      <ul className="mt-3 space-y-2">
        {sprint.map((t) => {
          const closed = t.status === 'done' || t.status === 'na';
          const daysLeft = t.dueDateResolved ? diffDays(today, t.dueDateResolved) : null;
          return (
            <li
              key={t.id}
              className={`flex items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2.5 ${
                closed ? 'opacity-45' : ''
              }`}
            >
              <div className="min-w-0">
                <p className={`truncate text-sm font-medium text-ink ${closed ? 'line-through' : ''}`}>
                  {t.title}
                </p>
                <p className="text-xs text-ink/50">
                  {t.dueDateResolved ?? '期限未定'}
                  {t.deadline === 'hard' && (
                    <span className="ml-1 rounded bg-alert/10 px-1.5 py-0.5 text-alert">法定</span>
                  )}
                </p>
              </div>
              {!closed && daysLeft != null && (
                <span
                  className={`shrink-0 font-display text-sm font-bold ${
                    daysLeft < 0 ? 'text-alert' : 'text-ink'
                  }`}
                >
                  {daysLeft < 0 ? `${-daysLeft}日超過` : `あと${daysLeft}日`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AssigneeBadge({
  assignee, names,
}: { assignee?: 'partner1' | 'partner2' | 'both'; names: Household }) {
  if (!assignee) return null;
  return (
    <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-accent">
      {assigneeLabel(assignee, names)}
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
