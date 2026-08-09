import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react';

/** 取り消しを押すまでの猶予。産後の片手操作を想定して長めに取る */
const TOAST_MS = 8000;

interface ToastAction {
  label: string;
  run: () => void;
}
interface ToastState {
  message: string;
  action?: ToastAction;
}

export interface ToastApi {
  /** 結果を知らせるだけ。OS標準のalert()の置き換え */
  notify: (message: string) => void;
  /** 取り消し口つき。削除など、確認より取り消しの方が速い操作に使う */
  notifyWithAction: (message: string, action: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((next: ToastState) => {
    clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    notify: (message) => show({ message }),
    notifyWithAction: (message, action) => show({ message, action }),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 mx-auto max-w-md px-5">
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white"
          >
            <span className="min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  clearTimeout(timer.current);
                  setToast(null);
                  toast.action?.run();
                }}
                className="flex min-h-11 shrink-0 items-center rounded-full border border-white/40 px-4 font-bold text-white hover:bg-white/15"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast は ToastProvider の内側でのみ使えます');
  return api;
}
