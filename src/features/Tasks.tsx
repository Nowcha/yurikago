import { useMemo, useState } from 'react';
import type { Household, TaskInstance, TaskStatus, Assignee } from '../types';
import { todayYmd, urgency } from '../lib/deadline';
import { Flag } from 'lucide-react';
import { updateTask, addTask, removeTask } from '../lib/store';
import { AssigneeBadge } from './Dashboard';

const CATEGORY_LABEL: Record<string, string> = {
  procedure: '手続き', purchase: '購入', prep: '準備', health: '健康', work: '会社',
};
const AUTHORITY_LABEL: Record<string, string> = {
  koto: '江東区', tokyo: '東京都', national: '国', employer: '会社', hospital: '産院',
};

export default function Tasks({ household, tasks }: { household: Household; tasks: TaskInstance[] }) {
  const [showDone, setShowDone] = useState(false);
  const [selected, setSelected] = useState<TaskInstance | null>(null);
  const today = todayYmd();

  const { scheduled, unscheduled } = useMemo(() => {
    const visible = tasks.filter((t) =>
      showDone ? true : t.status === 'todo' || t.status === 'doing');
    return {
      scheduled: visible
        .filter((t) => t.dueDateResolved)
        .sort((a, b) => (a.dueDateResolved! < b.dueDateResolved! ? -1 : 1)),
      unscheduled: visible.filter((t) => !t.dueDateResolved),
    };
  }, [tasks, showDone]);

  return (
    <div className="px-5 pt-8">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-xl font-bold text-ink">やること</h1>
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          完了も表示
        </label>
      </header>

      {/* 逆算背骨タイムライン（シグネチャ要素） */}
      <ol className="relative mt-6 space-y-3 border-l-2 border-accent/25 pl-5">
        {scheduled.map((t) => {
          const u = urgency(t.dueDateResolved, today);
          return (
            <li key={t.id} className="relative">
              <span
                className={`absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-white ${
                  u === 'overdue' ? 'bg-alert' : u === 'imminent' ? 'bg-sub' : 'bg-accent/50'
                }`}
              />
              <TaskCard t={t} household={household} onOpen={() => setSelected(t)} />
            </li>
          );
        })}
        <li className="relative pt-2">
          <span className="absolute -left-[31px] top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white"><Flag size={10} strokeWidth={2.5} aria-hidden /></span>
          <p className="font-display text-sm font-bold text-accent">
            出産予定日 {household.dueDate}
          </p>
        </li>
      </ol>

      {unscheduled.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-ink/60">
            生まれたら期限が決まるもの（産前にできる準備あり）
          </h2>
          <ul className="mt-3 space-y-3">
            {unscheduled.map((t) => (
              <li key={t.id}>
                <TaskCard t={t} household={household} onOpen={() => setSelected(t)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ManualTaskForm householdId={household.id} dueDate={household.dueDate} />

      {selected && (
        <TaskSheet
          key={selected.id}
          task={tasks.find((t) => t.id === selected.id) ?? selected}
          household={household}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function TaskCard({ t, household, onOpen }: {
  t: TaskInstance; household: Household; onOpen: () => void;
}) {
  const done = t.status === 'done' || t.status === 'na';
  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-2xl bg-white p-4 text-left border border-ink/10 active:scale-[0.99] ${
        done ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium text-ink ${done ? 'line-through' : ''}`}>{t.title}</p>
        <AssigneeBadge assignee={t.assignee} names={household} />
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
        {t.dueDateResolved && <span>{t.dueDateResolved}まで</span>}
        {t.deadline === 'hard' && (
          <span className="rounded bg-alert/10 px-1.5 py-0.5 text-alert">法定期限</span>
        )}
        <span className="rounded bg-base px-1.5 py-0.5">{CATEGORY_LABEL[t.category]}</span>
        {t.authority && (
          <span className="rounded bg-base px-1.5 py-0.5">{AUTHORITY_LABEL[t.authority]}</span>
        )}
      </p>
    </button>
  );
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: '未着手' },
  { value: 'doing', label: '進行中' },
  { value: 'done', label: '完了' },
  { value: 'na', label: '対象外' },
];
const ASSIGNEE_OPTIONS: { value: Assignee; label: (h: Household) => string }[] = [
  { value: 'partner1', label: (h) => h.memberNames[h.memberUids[0]] ?? 'メンバー1' },
  { value: 'partner2', label: (h) => h.memberNames[h.memberUids[1]] ?? 'メンバー2' },
  { value: 'both', label: () => 'ふたり' },
];

function TaskSheet({ task, household, onClose }: {
  task: TaskInstance; household: Household; onClose: () => void;
}) {
  const patch = (p: Partial<TaskInstance>) => updateTask(household.id, task.id, p);
  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/40" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
        <h2 className="font-display text-lg font-bold text-ink">{task.title}</h2>
        {task.dueDateResolved && (
          <p className="mt-1 text-sm text-ink/60">
            期限 {task.dueDateResolved}
            {task.deadline === 'hard' && <span className="ml-1 text-alert">（法定）</span>}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => patch({ status: s.value })}
              className={`flex-1 rounded-full py-2 text-sm font-medium ${
                task.status === s.value ? 'bg-accent text-white' : 'bg-base text-ink/60'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs font-bold text-ink/50">担当</p>
        <div className="mt-1.5 flex gap-2">
          {ASSIGNEE_OPTIONS.map((a) => (
            <button
              key={a.value}
              onClick={() => patch({ assignee: a.value })}
              className={`flex-1 rounded-full py-2 text-sm ${
                task.assignee === a.value ? 'bg-surface text-accent font-bold' : 'bg-base text-ink/60'
              }`}
            >
              {a.label(household)}
            </button>
          ))}
        </div>

        {task.prepTasks && task.prepTasks.length > 0 && (
          <>
            <p className="mt-5 text-xs font-bold text-ink/50">産前にできる準備</p>
            <ul className="mt-1.5 space-y-2">
              {task.prepTasks.map((p, i) => (
                <li key={i}>
                  <label className="flex items-start gap-2.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={task.prepDone?.[i] ?? false}
                      onChange={(e) => {
                        const prepDone = [...(task.prepDone ?? task.prepTasks!.map(() => false))];
                        prepDone[i] = e.target.checked;
                        patch({ prepDone });
                      }}
                    />
                    {p}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {task.notes && (
          <p className="mt-5 rounded-xl bg-base p-3 text-sm leading-relaxed text-ink/80">
            {task.notes}
          </p>
        )}

        {task.links?.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-sm text-accent underline underline-offset-2"
          >
            {l.label} ↗
          </a>
        ))}

        {!task.templateId && (
          <button
            onClick={() => {
              if (confirm('このタスクを削除しますか？')) {
                removeTask(household.id, task.id);
                onClose();
              }
            }}
            className="mt-5 w-full rounded-full bg-alert/10 py-2.5 text-sm font-bold text-alert"
          >
            タスクを削除
          </button>
        )}

        <label className="mt-5 block text-xs font-bold text-ink/50">
          メモ（社内締切の上書き等はここに）
          <textarea
            defaultValue={task.userMemo ?? ''}
            onBlur={(e) => patch({ userMemo: e.target.value })}
            rows={2}
            className="mt-1.5 w-full rounded-xl border border-accent/20 bg-base p-3 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

function ManualTaskForm({ householdId, dueDate }: { householdId: string; dueDate: string }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  return (
    <form
      className="mt-8 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        addTask(householdId, {
          title: title.trim(),
          category: 'prep',
          trigger: { type: 'beforeDue', days: due ? Math.max(0, -daysFrom(dueDate, due)) : 0 },
          status: 'todo',
          dueDateResolved: due || null,
          createdAt: Date.now(),
        });
        setTitle('');
        setDue('');
      }}
    >
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タスクを追加"
          className="flex-1 rounded-full border border-accent/20 bg-white px-4 py-3 text-sm"
        />
        <button className="rounded-full bg-accent px-5 font-bold text-white">追加</button>
      </div>
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className="w-full rounded-full border border-accent/20 bg-white px-4 py-2.5 text-sm text-ink/70"
        aria-label="期限（任意）"
      />
    </form>
  );
}

function daysFrom(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}
