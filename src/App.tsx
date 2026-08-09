import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUrlState } from './hooks/useUrlState';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import type { User } from 'firebase/auth';
import type { Household, TaskInstance, PurchaseItem, CareRecord } from './types';
import {
  Home, ListTodo, Package, NotebookPen, Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react';
import {
  watchAuth, watchMyHousehold, watchTasks, watchItems, watchRecords, type SyncState,
} from './lib/store';
import SyncBanner from './components/SyncBanner';
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
  const [tab, setTab] = useUrlState<Tab>('tab', 'home');
  const [syncError, setSyncError] = useState<string | null>(null);
  // 購読ごとの同期状態。未送信はコレクション横断で見ないと取りこぼす
  const [syncParts, setSyncParts] = useState<Record<string, SyncState>>({});
  const online = useOnlineStatus();

  const reportSync = useCallback((key: string, next: SyncState) => {
    setSyncParts((prev) => {
      const current = prev[key];
      if (current
        && current.fromCache === next.fromCache
        && current.hasPendingWrites === next.hasPendingWrites) return prev;
      return { ...prev, [key]: next };
    });
  }, []);

  const sync = useMemo<SyncState>(() => {
    const parts = Object.values(syncParts);
    return {
      // OSが切断を報告した時点で確定。Firestoreの検知を待たない
      fromCache: !online || parts.some((part) => part.fromCache),
      hasPendingWrites: parts.some((part) => part.hasPendingWrites),
    };
  }, [online, syncParts]);

  useEffect(() => watchAuth(setUser), []);

  useEffect(() => {
    if (!user) { setHousehold(user === null ? null : undefined); return; }
    setSyncError(null);
    return watchMyHousehold(
      user.uid,
      (h, s) => { setHousehold(h); reportSync('household', s); },
      (e) => setSyncError(e.code),
    );
  }, [user, reportSync]);

  useEffect(() => {
    if (!household) { setTasks([]); setItems([]); return; }
    const onError = (e: { code: string }) => setSyncError(e.code);
    const u1 = watchTasks(household.id, (next, s) => {
      setTasks(next); reportSync('tasks', s);
    }, onError);
    const u2 = watchItems(household.id, (next, s) => {
      setItems(next); reportSync('items', s);
    }, onError);
    const u3 = household.birthDate
      ? watchRecords(household.id, (next, s) => {
        setRecords(next); reportSync('records', s);
      }, onError)
      : undefined;
    return () => { u1(); u2(); u3?.(); };
  }, [household?.id, household?.birthDate, reportSync]);

  // 購読が失敗すると以降コールバックは来ない。スプラッシュのまま放置せず理由を出す
  if (syncError) return <SyncErrorScreen code={syncError} />;
  if (user === undefined || (user && household === undefined)) {
    return <Splash message="読み込み中…" />;
  }
  if (!user || !household) {
    return <Setup user={user ?? null} sync={sync} />;
  }

  const tabs = household.birthDate ? POSTPARTUM_TABS : BASE_TABS;

  return (
    <div className="flex min-h-dvh bg-base">
      {/* PCでは画面下端まで視線を動かさずに済む左サイドナビにする */}
      <nav
        aria-label="メインナビゲーション"
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-ink/10 bg-white p-4 md:flex"
      >
        <p className="px-3 pb-4 font-display text-lg font-bold text-ink">ゆりかご</p>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
              tab === t.id ? 'bg-surface text-accent' : 'text-sub hover:bg-base hover:text-ink'
            }`}
          >
            <t.icon size={18} strokeWidth={tab === t.id ? 2.2 : 1.6} aria-hidden />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-24 md:pb-8">
          {/* 全画面に出す。設定を開かないと同期異常に気づけない状態を作らない */}
          <SyncBanner sync={sync} className="mx-auto mt-4 max-w-md md:mx-5" />
          {tab === 'home' && (
            <Dashboard household={household} tasks={tasks} items={items} onGoTasks={() => setTab('tasks')} />
          )}
          {tab === 'tasks' && <Tasks household={household} tasks={tasks} />}
          {tab === 'items' && <Purchases household={household} items={items} />}
          {tab === 'records' && household.birthDate && (
            <Records household={household} records={records} uid={user.uid} />
          )}
          {tab === 'settings' && (
            <Settings user={user} household={household} tasks={tasks} items={items} sync={sync} />
          )}
        </main>
      </div>

      <nav
        aria-label="メインナビゲーション"
        className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-ink/10 bg-white/95 backdrop-blur md:hidden"
      >
        <div className={`grid ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 py-3 text-xs font-medium ${
                tab === t.id ? 'text-accent' : 'text-sub hover:text-ink'
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
        className="rounded-full border border-ink hover:bg-surface px-6 py-3 font-display font-bold text-ink active:scale-95"
      >
        もう一度読み込む
      </button>
    </div>
  );
}
