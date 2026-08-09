import { useId, useRef, type ReactNode } from 'react';
import { useDialog } from './useDialog';

/**
 * 取り消しが効かない操作にだけ使う確認。
 * 取り消せる操作は確認を出さず、実行してからトーストで取り消し口を出す方が速い。
 */
export default function ConfirmDialog({
  title, body, confirmLabel, destructive = false, busy = false, onConfirm, onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(panelRef, onCancel);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 p-6" onClick={onCancel}>
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white p-6 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="font-display font-bold text-ink">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-ink/80">{body}</div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-full border border-ink/15 py-2.5 text-sm text-sub hover:bg-surface disabled:opacity-40"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex-1 rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-40 ${
              destructive ? 'bg-alert hover:bg-alert/85' : 'bg-accent hover:bg-ink/85'
            }`}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
