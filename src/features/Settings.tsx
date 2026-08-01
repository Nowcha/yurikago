import { useState } from 'react';
import type { User } from 'firebase/auth';
import type { Household, TaskInstance, PurchaseItem } from '../types';
import {
  addPartner, updateHouseholdSettings, logout, importBackup, deleteHouseholdData, loadAllRecords,
  syncMasterData,
} from '../lib/store';
import { exportIcs, exportJson } from '../lib/exporters';

export default function Settings({ user, household, tasks, items }: {
  user: User; household: Household; tasks: TaskInstance[]; items: PurchaseItem[];
}) {
  const [partnerUid, setPartnerUid] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [confirmBirth, setConfirmBirth] = useState(false);
  const [editingHousehold, setEditingHousehold] = useState(false);
  const [householdName, setHouseholdName] = useState(household.name);
  const [dueDate, setDueDate] = useState(household.dueDate);
  const [bothParentsLeave, setBothParentsLeave] = useState(
    household.profile?.bothParentsLeave ?? true,
  );
  const [motherIsEmployee, setMotherIsEmployee] = useState(
    household.profile?.motherIsEmployee ?? true,
  );
  const [savingHousehold, setSavingHousehold] = useState(false);
  const [householdError, setHouseholdError] = useState<string | null>(null);
  const [syncingMaster, setSyncingMaster] = useState(false);
  const solo = household.memberUids.length < 2;

  return (
    <div className="space-y-6 px-5 pt-8">
      <h1 className="font-display text-xl font-bold text-ink">設定</h1>

      <section className="rounded-2xl bg-white p-5 border border-ink/10">
        <h2 className="font-display font-bold text-ink">世帯</h2>
        {!editingHousehold ? (
          <>
            <p className="mt-1 text-sm text-ink/60">
              {household.name} ／ 予定日 {household.dueDate}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              夫婦とも育休: {household.profile?.bothParentsLeave ? '予定あり' : '予定なし'} ／
              出産する側の出産手当金: {household.profile?.motherIsEmployee ? '対象候補' : '対象外'}
            </p>
            <button
              onClick={() => {
                setHouseholdName(household.name);
                setDueDate(household.dueDate);
                setBothParentsLeave(household.profile?.bothParentsLeave ?? true);
                setMotherIsEmployee(household.profile?.motherIsEmployee ?? true);
                setHouseholdError(null);
                setEditingHousehold(true);
              }}
              className="mt-3 rounded-full border border-ink/15 px-4 py-2 text-sm font-bold text-ink"
            >
              世帯設定を変更
            </button>
          </>
        ) : (
          <div className="mt-3 space-y-3 rounded-xl bg-base p-4">
            <label className="block text-sm text-ink/70">
              世帯の名前
              <input
                value={householdName}
                onChange={(event) => setHouseholdName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5"
              />
            </label>
            <label className="block text-sm text-ink/70">
              出産予定日
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink/80">
              <input
                type="checkbox"
                checked={bothParentsLeave}
                onChange={(event) => setBothParentsLeave(event.target.checked)}
              />
              夫婦とも育休を取得する予定
            </label>
            <label className="flex items-center gap-2 text-sm text-ink/80">
              <input
                type="checkbox"
                checked={motherIsEmployee}
                onChange={(event) => setMotherIsEmployee(event.target.checked)}
              />
              出産する側が会社員・公務員（出産手当金の対象）
            </label>
            <p className="text-xs leading-relaxed text-ink/50">
              予定日を変更すると期限を再計算します。対象条件が変わった手続きは「対象外」または「未着手」に更新します。
            </p>
            {householdError && <p className="text-sm text-alert">{householdError}</p>}
            <div className="flex gap-2">
              <button
                disabled={savingHousehold}
                onClick={() => setEditingHousehold(false)}
                className="flex-1 rounded-full border border-ink/15 py-2.5 text-sm text-ink/60 disabled:opacity-40"
              >
                キャンセル
              </button>
              <button
                disabled={!householdName.trim() || !dueDate || savingHousehold}
                onClick={async () => {
                  setSavingHousehold(true);
                  setHouseholdError(null);
                  try {
                    await updateHouseholdSettings(household, tasks, {
                      name: householdName.trim(),
                      dueDate,
                      birthDate: household.birthDate ?? null,
                      profile: { bothParentsLeave, motherIsEmployee },
                    });
                    setEditingHousehold(false);
                  } catch {
                    setHouseholdError('世帯設定を保存できませんでした。もう一度お試しください。');
                  } finally {
                    setSavingHousehold(false);
                  }
                }}
                className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {savingHousehold ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}
        <ul className="mt-2 text-sm text-ink/80">
          {household.memberUids.map((uid) => (
            <li key={uid}>・{household.memberNames[uid] ?? uid}{uid === user.uid && '（自分）'}</li>
          ))}
        </ul>
        {solo && (
          <div className="mt-4 rounded-xl bg-base p-4">
            <p className="text-sm font-bold text-ink">パートナーを追加</p>
            <p className="mt-1 text-xs leading-relaxed text-ink/60">
              パートナーが同じURLでGoogleログインすると、初期画面に本人のIDが表示されます。
              それをここに貼り付けてください。
            </p>
            <input
              value={partnerUid}
              onChange={(e) => setPartnerUid(e.target.value)}
              placeholder="パートナーのID"
              className="mt-2 w-full rounded-xl border border-accent/20 bg-white px-3 py-2.5 font-mono text-xs"
            />
            <input
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="表示名（例: はな）"
              className="mt-2 w-full rounded-xl border border-accent/20 bg-white px-3 py-2.5 text-sm"
            />
            <button
              disabled={!partnerUid.trim() || !partnerName.trim()}
              onClick={() => addPartner(household.id, partnerUid.trim(), partnerName.trim())}
              className="mt-3 w-full rounded-full bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              追加する
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-ink/25 bg-white p-5">
        <h2 className="font-display font-bold text-ink">
          {household.birthDate ? '出生日' : '生まれたら'}
        </h2>
        {household.birthDate && (
          <p className="mt-1 text-xs leading-relaxed text-ink/60">
            現在の出生日は {household.birthDate} です。訂正すると産後手続きの期限を再計算します。
          </p>
        )}
        {!household.birthDate && (
          <p className="mt-1 text-xs leading-relaxed text-ink/60">
            出生日を登録すると、出生届（14日以内）・児童手当（15日以内）など
            すべての産後手続きの期限が確定します。
          </p>
        )}
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="mt-3 w-full rounded-xl border border-accent/20 bg-base px-4 py-3"
        />
        {!confirmBirth ? (
          <button
            disabled={!birthDate}
            onClick={() => setConfirmBirth(true)}
            className="mt-3 w-full rounded-full bg-accent py-3 font-display font-bold text-white disabled:opacity-40"
          >
            {household.birthDate ? '出生日を訂正する' : '出生日を登録する'}
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-center text-sm text-ink">
              {birthDate} で確定し、産後手続きの期限を再計算します。よろしいですか？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmBirth(false)}
                className="flex-1 rounded-full bg-base py-3 text-sm text-ink/60"
              >
                戻る
              </button>
              <button
                onClick={async () => {
                  setSavingHousehold(true);
                  try {
                    await updateHouseholdSettings(household, tasks, {
                      name: household.name,
                      dueDate: household.dueDate,
                      birthDate,
                      profile: household.profile ?? {
                        bothParentsLeave: true,
                        motherIsEmployee: true,
                      },
                    });
                    setBirthDate('');
                    setConfirmBirth(false);
                  } catch {
                    alert('出生日を保存できませんでした');
                  } finally {
                    setSavingHousehold(false);
                  }
                }}
                disabled={savingHousehold}
                className="flex-1 rounded-full bg-accent py-3 font-bold text-white disabled:opacity-40"
              >
                {savingHousehold ? '保存中…' : '確定'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 border border-ink/10">
        <h2 className="font-display font-bold text-ink">初期データ</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink/60">
          江東区・東京都・国の最新マスターから不足している手続きと準備品を追加し、制度説明を更新します。完了状態・担当・メモ・実費・上書き期限は保持します。
        </p>
        <button
          disabled={syncingMaster}
          onClick={async () => {
            setSyncingMaster(true);
            try {
              const result = await syncMasterData(household, tasks, items);
              alert(`初期データを更新しました（手続き ${result.addedTasks}件追加、準備品 ${result.addedItems}件追加）`);
            } catch {
              alert('初期データを更新できませんでした');
            } finally {
              setSyncingMaster(false);
            }
          }}
          className="mt-3 w-full rounded-full border border-ink/15 py-3 text-sm font-bold text-ink disabled:opacity-40"
        >
          {syncingMaster ? '更新中…' : '初期データを最新版に更新'}
        </button>
      </section>

      <section className="rounded-2xl bg-white p-5 border border-ink/10">
        <h2 className="font-display font-bold text-ink">エクスポート</h2>
        <div className="mt-3 space-y-2">
          <button
            onClick={() => exportIcs(tasks)}
            className="w-full rounded-full bg-surface py-3 text-sm font-bold text-accent"
          >
            法定期限をカレンダーに登録（.ics）
          </button>
          <button
            onClick={async () => {
              try {
                const allRecords = await loadAllRecords(household.id);
                exportJson(household, tasks, items, allRecords);
              } catch {
                alert('バックアップデータを取得できませんでした');
              }
            }}
            className="w-full rounded-full bg-surface py-3 text-sm font-bold text-accent"
          >
            全データをバックアップ（.json）
          </button>
          <label className="block w-full cursor-pointer rounded-full bg-surface py-3 text-center text-sm font-bold text-accent">
            バックアップから復元（.json）
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const payload = JSON.parse(await file.text());
                  if (!payload.household || !Array.isArray(payload.tasks)) {
                    alert('バックアップファイルの形式が正しくありません');
                    return;
                  }
                  if (confirm('現在のデータに上書き復元します。よろしいですか？')) {
                    await importBackup(household.id, payload);
                    alert('復元しました');
                  }
                } catch {
                  alert('ファイルを読み込めませんでした');
                } finally {
                  e.target.value = '';
                }
              }}
            />
          </label>
          <p className="text-xs text-ink/50">
            JSONはClaude Codeの分析コマンドの入力にも使えます
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 border border-ink/10">
        <h2 className="font-display font-bold text-alert">危険な操作</h2>
        <button
          onClick={async () => {
            if (!confirm('世帯のすべてのデータ（タスク・準備品・記録）を削除します。元に戻せません。よろしいですか？')) return;
            if (!confirm('本当に削除しますか？事前にバックアップ（.json）を取ることをおすすめします。')) return;
            try {
              await deleteHouseholdData(household.id, tasks, items);
            } catch {
              alert('世帯データを削除できませんでした');
            }
          }}
          className="mt-3 w-full rounded-full border border-alert/40 py-3 text-sm font-bold text-alert"
        >
          世帯データをすべて削除
        </button>
      </section>

      <button onClick={() => logout()} className="w-full py-3 text-sm text-ink/40">
        ログアウト
      </button>
    </div>
  );
}
