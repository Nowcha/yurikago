import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Household, TaskInstance, PurchaseItem, CareRecord } from './types';
import {
  Home, ListTodo, Package, NotebookPen, Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react';
import { watchAuth, watchMyHousehold, watchTasks, watchItems, watchRecords } from './lib/store';
import Setup from './features/Setup';
import Dashboard from './features/Dashboard';
import Tasks from './features/Tasks';
import Purchases from './features/Purchases';
import Records from './features/Records';
import Settings from './features/Settings';

type Tab = 'home' | 'tasks' | 'items' | 'records' | 'settings';

const BASE_TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'tasks', label: 'やること', icon: ListTodo },
  { id: 'items', label: '準備品', icon: Package },
  { id: 'settings', label: '設定', icon: SettingsIcon },
];
// 出生日登録後は「きろく」を最前列に（産後の主用途になるため）
const POSTPARTUM_TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'records', label: 'きろく', icon: NotebookPen },
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'tasks', label: 'やること', icon: ListTodo },
  { id: 'items', label: '準備品', icon: Package },
  { id: 'settings', label: '設定', icon: SettingsIcon },
];

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [household, setHousehold] = useState<Household | null | undefined>(undefined);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => watchAuth(setUser), []);

  useEffect(() => {
    if (!user) { setHousehold(user === null ? null : undefined); return; }
    setSyncError(null);
    return watchMyHousehold(user.uid, setHousehold, (e) => setSyncError(e.code));
  }, [user]);

  useEffect(() => {
    if (!household) { setTasks([]); setItems([]); return; }
    const onError = (e: { code: string }) => setSyncError(e.code);
    const u1 = watchTasks(household.id, setTasks, onError);
    const u2 = watchItems(household.id, setItems, onError);
    const u3 = household.birthDate
      ? watchRecords(household.id, setRecords, onError)
      : undefined;
    return () => { u1(); u2(); u3?.(); };
  }, [household?.id, household?.birthDate]);

  // 購読が失敗すると以降コールバックは来ない。スプラッシュのまま放置せず理由を出す
  if (syncError) return <SyncErrorScreen code={syncError} />;
  if (user === undefined || (user && household === undefined)) {
    return <Splash message="読み込み中…" />;
  }
  if (!user || !household) {
    return <Setup user={user ?? null} />;
  }

  const tabs = household.birthDate ? POSTPARTUM_TABS : BASE_TABS;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-base">
      <main className="flex-1 pb-24">
        {tab === 'home' && (
          <Dashboard household={household} tasks={tasks} items={items} onGoTasks={() => setTab('tasks')} />
        )}
        {tab === 'tasks' && <Tasks household={household} tasks={tasks} />}
        {tab === 'items' && <Purchases household={household} items={items} />}
        {tab === 'records' && household.birthDate && (
          <Records household={household} records={records} uid={user.uid} />
        )}
        {tab === 'settings' && (
          <Settings user={user} household={household} tasks={tasks} items={items} />
        )}
      </main>
      <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-ink/10 bg-white/95 backdrop-blur">
        <div className={`grid ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 py-3 text-xs font-medium ${
                tab === t.id ? 'text-accent' : 'text-ink/50'
              }`}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <t.icon size={20} strokeWidth={tab === t.id ? 2.2 : 1.6} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Splash({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-base">
      <p className="font-display text-accent">{message}</p>
    </div>
  );
}

function SyncErrorScreen({ code }: { code: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-base px-6 text-center">
      <p className="font-display text-lg font-bold text-ink">データを読み込めませんでした</p>
      <p className="text-sm leading-relaxed text-ink/70">
        通信が不安定か、この世帯へのアクセス権がない可能性があります。
        解決しない場合はこのコードをそのまま共有してください。
      </p>
      <p className="rounded-xl bg-alert/10 px-4 py-2 font-mono text-sm text-alert">{code}</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-full border border-ink px-6 py-3 font-display font-bold text-ink active:scale-95"
      >
        もう一度読み込む
      </button>
    </div>
  );
}
