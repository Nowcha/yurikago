import type { SyncState } from '../lib/store';

/**
 * Firestoreのオフラインキャッシュは通信断でもエラーを出さず古い結果を配り続ける。
 * 「相手の変更が届かない」と「自分の変更が送れていない」を無音にしないための表示。
 */
export default function SyncBanner({ sync, className = '' }: {
  sync: SyncState; className?: string;
}) {
  if (!sync.fromCache && !sync.hasPendingWrites) return null;

  return (
    <div
      className={`rounded-xl border border-alert/30 bg-alert/5 p-3 text-xs leading-relaxed text-alert ${className}`}
    >
      {sync.fromCache ? (
        <>
          <span className="font-bold">サーバーに接続できていません</span>
          <br />
          表示は端末に保存された内容です。相手が行った変更はまだ届いていません。
          機内モード・省データモード・広告ブロッカー・VPNを解除して開き直してください。
        </>
      ) : (
        <>
          <span className="font-bold">未送信の変更があります</span>
          <br />
          この端末では反映済みですが、相手にはまだ届いていません。
        </>
      )}
    </div>
  );
}
