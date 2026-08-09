import { useMemo, useState } from 'react';
import type {
  Household, TaskInstance, TaskStatus, Assignee, TaskCategory,
} from '../types';
import { todayYmd, urgency } from '../lib/deadline';
import { Flag } from 'lucide-react';
import {
  updateTask, addTask, removeTask, restoreTask, setTaskDueDate, clearTaskAssignee,
} from '../lib/store';
import { AssigneeBadge } from './Dashboard';
import { CATEGORY_LABEL, AUTHORITY_LABEL, assigneeLabel } from '../lib/labels';
import { taskDateBounds } from '../lib/dateBounds';
import Sheet from '../components/Sheet';
import { useToast } from '../components/Toast';
import { describeWriteError } from '../lib/sync';
import { useUrlState } from '../hooks/useUrlState';
import { useMediaQuery, WIDE_SCREEN } from '../hooks/useMediaQuery';
import { Search, X } from 'lucide-react';

const TASK_DATE_BOUNDS = taskDateBounds();

type DeadlineFilter = 'all' | 'overdue' | 'week' | 'unscheduled';

const STATUS_FILTER_LABEL: Record<string, string> = {
  active: '未完了', todo: '未着手', doing: '進行中', done: '完了', na: '対象外', all: 'すべて',
};
const DEADLINE_FILTER_LABEL: Record<DeadlineFilter, string> = {
  all: 'すべて', overdue: '期限超過', week: '7日以内', unscheduled: '日付未確定',
};

export default function Tasks({ household, tasks }: { household: Household; tasks: TaskInstance[] }) {
  const [categoryFilter, setCategoryFilter] = useUrlState<TaskCategory | 'all'>('cat', 'all');
  const [assigneeFilter, setAssigneeFilter] = useUrlState<Assignee | 'none' | 'all'>('who', 'all');
  const [statusFilter, setStatusFilter] = useUrlState<TaskStatus | 'active' | 'all'>('st', 'active');
  const [deadlineFilter, setDeadlineFilter] = useUrlState<DeadlineFilter>('due', 'all');
  const [search, setSearch] = useUrlState<string>('q', '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE_SCREEN);
  const today = todayYmd();

  const { scheduled, unscheduled, visibleCount } = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const visible = tasks.filter((task) => {
      if (categoryFilter !== 'all' && task.category !== categoryFilter) return false;
      if (assigneeFilter === 'none' && task.assignee) return false;
      if (assigneeFilter !== 'all' && assigneeFilter !== 'none'
        && task.assignee !== assigneeFilter) return false;
      if (statusFilter === 'active' && task.status !== 'todo' && task.status !== 'doing') return false;
      if (statusFilter !== 'active' && statusFilter !== 'all' && task.status !== statusFilter) return false;
      const taskUrgency = urgency(task.dueDateResolved, today);
      if (deadlineFilter === 'overdue' && taskUrgency !== 'overdue') return false;
      if (deadlineFilter === 'week' && taskUrgency !== 'imminent') return false;
      if (deadlineFilter === 'unscheduled' && taskUrgency !== 'unscheduled') return false;
      // 制度名で直接探せるように、本文と補足も対象に含める
      if (needle && !`${task.title} ${task.notes ?? ''} ${CATEGORY_LABEL[task.category]}`
        .toLowerCase().includes(needle)) return false;
      return true;
    });
    return {
      scheduled: visible
        .filter((t) => t.dueDateResolved)
        .sort((a, b) => (a.dueDateResolved! < b.dueDateResolved! ? -1 : 1)),
      unscheduled: visible.filter((t) => !t.dueDateResolved),
      visibleCount: visible.length,
    };
  }, [assigneeFilter, categoryFilter, deadlineFilter, search, statusFilter, tasks, today]);

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;
  const activeFilters = [
    categoryFilter !== 'all' && ['カテゴリ', CATEGORY_LABEL[categoryFilter as TaskCategory], () => setCategoryFilter('all')],
    assigneeFilter !== 'all' && ['担当', assigneeFilter === 'none' ? '担当未定' : assigneeLabel(assigneeFilter, household), () => setAssigneeFilter('all')],
    statusFilter !== 'active' && ['状態', STATUS_FILTER_LABEL[statusFilter], () => setStatusFilter('active')],
    deadlineFilter !== 'all' && ['期限', DEADLINE_FILTER_LABEL[deadlineFilter], () => setDeadlineFilter('all')],
    search.trim() !== '' && ['検索', search.trim(), () => setSearch('')],
  ].filter(Boolean) as [string, string, () => void][];

  const resetFilters = () => {
    setCategoryFilter('all');
    setAssigneeFilter('all');
    setStatusFilter('active');
    setDeadlineFilter('all');
    setSearch('');
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-8 md:max-w-xl lg:max-w-5xl xl:flex xl:max-w-[88rem] xl:gap-8">
      <div className="min-w-0 xl:flex-1">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">やること</h1>
        <div className="relative mt-4">
          <Search
            size={16}
            strokeWidth={1.6}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sub"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="制度名・キーワードで探す"
            aria-label="タスクを検索"
            className="w-full rounded-full border border-ink/15 bg-white py-2.5 pl-11 pr-4 text-sm text-ink"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <FilterSelect
            label="カテゴリ"
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value as TaskCategory | 'all')}
            options={[
              ['all', 'すべてのカテゴリ'],
              ...Object.entries(CATEGORY_LABEL),
            ]}
          />
          <FilterSelect
            label="担当"
            value={assigneeFilter}
            onChange={(value) => setAssigneeFilter(value as Assignee | 'none' | 'all')}
            options={[
              ['all', 'すべての担当'],
              ['partner1', assigneeLabel('partner1', household)],
              ['partner2', assigneeLabel('partner2', household)],
              ['both', 'ふたり'],
              ['none', '担当未定'],
            ]}
          />
          <FilterSelect
            label="状態"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as TaskStatus | 'active' | 'all')}
            options={[
              ['active', '未完了'], ['todo', '未着手'], ['doing', '進行中'],
              ['done', '完了'], ['na', '対象外'], ['all', 'すべての状態'],
            ]}
          />
          <FilterSelect
            label="期限"
            value={deadlineFilter}
            onChange={(value) => setDeadlineFilter(value as DeadlineFilter)}
            options={[
              ['all', 'すべての期限'], ['overdue', '期限超過'],
              ['week', '7日以内'], ['unscheduled', '日付未確定'],
            ]}
          />
        </div>
        {/* 何件に絞られているかと、その場で解除する手段を必ず出す */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-sub">
            {visibleCount}件 / 全{tasks.length}件
          </span>
          {activeFilters.map(([label, value, clear]) => (
            <button
              key={label}
              type="button"
              onClick={clear}
              className="flex items-center gap-1 rounded-full border border-ink/20 bg-white py-1 pl-2.5 pr-2 text-ink hover:border-ink/40"
            >
              <span className="text-sub">{label}:</span>
              {value}
              <X size={12} strokeWidth={2} aria-hidden />
              <span className="sr-only">この絞り込みを解除</span>
            </button>
          ))}
          {activeFilters.length > 1 && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-accent underline underline-offset-4 decoration-ink/25 hover:decoration-ink"
            >
              すべて解除
            </button>
          )}
        </div>
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
              <TaskCard t={t} household={household} onOpen={() => setSelectedId(t.id)} />
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

      {scheduled.length === 0 && unscheduled.length === 0 && (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 text-sm text-sub">
          <p>条件に一致するタスクはありません。</p>
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-2 text-accent underline underline-offset-4 decoration-ink/25 hover:decoration-ink"
            >
              絞り込みを解除して全件を見る
            </button>
          )}
        </div>
      )}

      {unscheduled.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-sub">
            生まれたら期限が決まるもの（産前にできる準備あり）
          </h2>
          <ul className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {unscheduled.map((t) => (
              <li key={t.id}>
                <TaskCard t={t} household={household} onOpen={() => setSelectedId(t.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ManualTaskForm householdId={household.id} dueDate={household.dueDate} />
      </div>

      {/* 広い画面では一覧を隠さず併置する。一覧に戻らずに次のタスクへ移れる */}
      {wide && (
        <aside className="sticky top-8 hidden h-fit max-h-[calc(100dvh-4rem)] w-[26rem] shrink-0 overflow-y-auto rounded-2xl border border-ink/10 bg-white p-6 xl:block">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-ink">{selected.title}</h2>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="詳細を閉じる"
                  className="-mr-2 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-sub hover:bg-surface hover:text-ink"
                >
                  <X size={20} strokeWidth={1.6} aria-hidden />
                </button>
              </div>
              <TaskDetail
                key={selected.id}
                task={selected}
                household={household}
                onClose={() => setSelectedId(null)}
              />
            </>
          ) : (
            <p className="text-sm text-sub">タスクを選ぶと、ここに詳細が出ます。</p>
          )}
        </aside>
      )}

      {!wide && selected && (
        <TaskSheet
          key={selected.id}
          task={selected}
          household={household}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="text-xs font-bold text-sub">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm font-normal text-ink"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function TaskCard({ t, household, onOpen }: {
  t: TaskInstance; household: Household; onOpen: () => void;
}) {
  const done = t.status === 'done' || t.status === 'na';
  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-2xl bg-white p-4 text-left border border-ink/10 hover:border-ink/35 active:scale-[0.99] ${
        done ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium text-ink ${done ? 'line-through' : ''}`}>{t.title}</p>
        <AssigneeBadge assignee={t.assignee} names={household} />
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-sub">
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
  { value: 'partner1', label: (h) => assigneeLabel('partner1', h) },
  { value: 'partner2', label: (h) => assigneeLabel('partner2', h) },
  { value: 'both', label: (h) => assigneeLabel('both', h) },
];

function TaskSheet({ task, household, onClose }: {
  task: TaskInstance; household: Household; onClose: () => void;
}) {
  return (
    <Sheet title={task.title} onClose={onClose}>
      <TaskDetail task={task} household={household} onClose={onClose} />
    </Sheet>
  );
}

/** シートと右ペインで共有する中身。枠は呼び出し側が用意する */
function TaskDetail({ task, household, onClose }: {
  task: TaskInstance; household: Household; onClose: () => void;
}) {
  const { notify, notifyWithAction } = useToast();
  // 状態や担当の変更が失敗しても無言だった。結果は必ず返す
  const patch = (p: Partial<TaskInstance>) => {
    void updateTask(household.id, task.id, p)
      .catch((error: unknown) => notify(describeWriteError(error)));
  };
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [dueDate, setDueDate] = useState(task.dueDateOverride ?? task.dueDateResolved ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  return (
    <>
      {task.dueDateResolved && (
        <p className="mt-1 text-sm text-sub">
          期限 {task.dueDateResolved}
          {task.deadline === 'hard' && <span className="ml-1 text-alert">（法定）</span>}
        </p>
      )}

        <div className="mt-4 space-y-3 rounded-xl bg-base p-4">
          {!task.templateId && (
            <>
              <label className="block text-xs font-bold text-sub">
                タスク名
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm font-normal text-ink"
                />
              </label>
              <label className="block text-xs font-bold text-sub">
                カテゴリ
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as TaskCategory)}
                  className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm font-normal text-ink"
                >
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="block text-xs font-bold text-sub">
            {task.templateId ? '期限の上書き' : '期限'}
            <input
              type="date"
              value={dueDate}
              min={TASK_DATE_BOUNDS.min}
              max={TASK_DATE_BOUNDS.max}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm font-normal text-ink"
            />
          </label>
          {task.dueDateOverride && (
            <button
              onClick={async () => {
                setSavingDetails(true);
                try {
                  await setTaskDueDate(household, task, null);
                  setDueDate('');
                } catch {
                  setDetailsError('自動計算の期限に戻せませんでした。');
                } finally {
                  setSavingDetails(false);
                }
              }}
              className="text-xs font-bold text-accent underline underline-offset-2"
            >
              自動計算の期限に戻す
            </button>
          )}
          {detailsError && <p className="text-xs text-alert">{detailsError}</p>}
          <button
            disabled={savingDetails || (!task.templateId && !title.trim())}
            onClick={async () => {
              setSavingDetails(true);
              setDetailsError(null);
              try {
                if (!task.templateId) await patch({ title: title.trim(), category });
                await setTaskDueDate(household, task, dueDate || null);
              } catch {
                setDetailsError('タスクの変更を保存できませんでした。');
              } finally {
                setSavingDetails(false);
              }
            }}
            className="w-full rounded-full border border-ink/15 hover:bg-surface bg-white py-2.5 text-sm font-bold text-ink disabled:opacity-40"
          >
            {savingDetails ? '保存中…' : 'タスク内容を保存'}
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => patch({ status: s.value })}
              className={`flex-1 rounded-full py-2 text-sm font-medium ${
                task.status === s.value ? 'bg-accent hover:bg-ink/85 text-white' : 'bg-base text-sub hover:bg-surface hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs font-bold text-sub">担当</p>
        <div className="mt-1.5 flex gap-2">
          {ASSIGNEE_OPTIONS.map((a) => (
            <button
              key={a.value}
              onClick={() => patch({ assignee: a.value })}
              className={`flex-1 rounded-full py-2 text-sm ${
                task.assignee === a.value ? 'bg-surface text-accent font-bold' : 'bg-base text-sub hover:bg-surface hover:text-ink'
              }`}
            >
              {a.label(household)}
            </button>
          ))}
          {task.assignee && (
            <button
              onClick={() => {
                void clearTaskAssignee(household.id, task.id)
                  .catch((error: unknown) => notify(describeWriteError(error)));
              }}
              className="rounded-full bg-base px-3 py-2 text-sm text-sub"
            >
              解除
            </button>
          )}
        </div>

        {task.prepTasks && task.prepTasks.length > 0 && (
          <>
            <p className="mt-5 text-xs font-bold text-sub">産前にできる準備</p>
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
            onClick={async () => {
              // 確認より取り消しの方が速い。先に消してから取り消し口を出す
              const snapshot = task;
              onClose();
              try {
                await removeTask(household.id, task.id);
                notifyWithAction(`「${snapshot.title}」を削除しました`, {
                  label: '取り消す',
                  run: () => {
                    void restoreTask(household.id, snapshot)
                      .catch((error: unknown) => notify(describeWriteError(error)));
                  },
                });
              } catch (error: unknown) {
                notify(describeWriteError(error));
              }
            }}
            className="mt-5 w-full rounded-full bg-alert/10 py-2.5 text-sm font-bold text-alert hover:bg-alert/20"
          >
            タスクを削除
          </button>
        )}

        <label className="mt-5 block text-xs font-bold text-sub">
          メモ
          <textarea
            defaultValue={task.userMemo ?? ''}
            onBlur={(e) => patch({ userMemo: e.target.value })}
            rows={2}
            className="mt-1.5 w-full rounded-xl border border-accent/20 bg-base p-3 text-sm"
          />
        </label>
    </>
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
        <button className="rounded-full bg-accent hover:bg-ink/85 px-5 font-bold text-white">追加</button>
      </div>
      <input
        type="date"
        value={due}
        min={TASK_DATE_BOUNDS.min}
        max={TASK_DATE_BOUNDS.max}
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
