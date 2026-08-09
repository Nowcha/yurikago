import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialog } from './useDialog';

/**
 * 下から出るシート。
 * 従来は背景タップでしか閉じられず、上部の横棒はスワイプできないのに
 * スワイプを示唆していた。横棒は閉じるボタンに置き換えている。
 */
export default function Sheet({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(panelRef, onClose);

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 pb-10 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-mr-2 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-sub hover:bg-surface hover:text-ink"
          >
            <X size={20} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
