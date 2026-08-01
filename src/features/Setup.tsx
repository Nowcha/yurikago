import { useState } from 'react';
import type { User } from 'firebase/auth';
import { login, createHousehold } from '../lib/store';

function hasErrorCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/** Firebase Authのエラーコードを画面表示用の日本語メッセージに変換 */
function describeAuthError(error: unknown): string | null {
  const code = hasErrorCode(error) ? error.code : undefined;
  switch (code) {
    case 'auth/unauthorized-domain':
      return 'このサイトのドメインがFirebaseで許可されていません。Firebaseコンソール > Authentication > Settings > 承認済みドメイン に追加してください。';
    case 'auth/popup-blocked':
      return 'ポップアップがブロックされました。ブラウザの設定でこのサイトのポップアップを許可してください。';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null; // 自分でポップアップを閉じただけなのでエラー表示不要
    default:
      return 'ログインに失敗しました。もう一度お試しください。';
  }
}

/**
 * ログイン → 世帯作成 or パートナーの追加待ち。
 * 参加フロー: 後から入る側はここで自分のIDを相手に伝え、
 * 先に世帯を作った側が「設定 > 世帯」で登録する（firestore.rules参照）。
 */
export default function Setup({ user }: { user: User | null }) {
  const [dueDate, setDueDate] = useState('');
  const [name, setName] = useState('わが家');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bothLeave, setBothLeave] = useState(true);
  const [motherEmployee, setMotherEmployee] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 bg-base px-6 py-10">
      <header className="text-center">
        <h1 className="font-display text-3xl font-bold text-accent">ゆりかご</h1>
        <p className="mt-2 text-sm text-ink/60">
          予定日から逆算する、ふたりの出産準備手帳
        </p>
      </header>

      {!user ? (
        <div className="space-y-3">
          <button
            disabled={loggingIn}
            onClick={async () => {
              setAuthError(null);
              setLoggingIn(true);
              try {
                await login();
              } catch (error: unknown) {
                setAuthError(describeAuthError(error));
              } finally {
                setLoggingIn(false);
              }
            }}
            className="w-full rounded-full bg-accent py-4 font-display text-lg font-bold text-white border border-ink active:scale-95 disabled:opacity-40"
          >
            {loggingIn ? 'ログイン中…' : 'Googleでログイン'}
          </button>
          {authError && (
            <p className="rounded-xl bg-alert/10 p-3 text-sm leading-relaxed text-alert">
              {authError}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="rounded-2xl bg-white p-6 border border-ink/10">
            <h2 className="font-display font-bold text-ink">新しく世帯をつくる</h2>
            <label className="mt-4 block text-sm text-ink/70">
              出産予定日
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-accent/20 bg-base px-4 py-3 text-lg"
              />
            </label>
            <label className="mt-3 block text-sm text-ink/70">
              世帯の名前
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-accent/20 bg-base px-4 py-3"
              />
            </label>
            <div className="mt-4 space-y-2 rounded-xl bg-base p-3 text-sm text-ink/80">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={bothLeave} onChange={(e) => setBothLeave(e.target.checked)} />
                夫婦とも育休を取得する予定
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={motherEmployee} onChange={(e) => setMotherEmployee(e.target.checked)} />
                出産する側が会社員・公務員（出産手当金の対象）
              </label>
              <p className="text-xs text-ink/50">
                当てはまらない手続きは「対象外」として生成されます（あとから変更できます）
              </p>
            </div>
            <button
              disabled={!dueDate || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await createHousehold(user.uid, user.displayName ?? '名前未設定', name, dueDate, {
                    bothParentsLeave: bothLeave,
                    motherIsEmployee: motherEmployee,
                  });
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-5 w-full rounded-full bg-accent py-3.5 font-display font-bold text-white disabled:opacity-40"
            >
              {busy ? '作成中…' : '世帯をつくってタスクを生成する'}
            </button>
            <p className="mt-2 text-xs text-ink/50">
              江東区・東京都・国・会社の手続き35件と準備品リストが自動で並びます
            </p>
          </section>

          <section className="rounded-2xl border border-dashed border-accent/30 p-6">
            <h2 className="font-display font-bold text-ink">パートナーの世帯に参加する</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">
              下のIDをパートナーに送ってください。相手が「設定 →
              世帯」であなたを追加すると、この画面が自動で切り替わります。
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(user.uid);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-3 w-full rounded-xl bg-base px-4 py-3 text-left font-mono text-xs text-ink/80"
            >
              {user.uid}
              <span className="mt-1 block font-sans text-accent">
                {copied ? 'コピーしました' : 'タップしてコピー'}
              </span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
