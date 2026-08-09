import { useEffect, useState } from 'react';

/**
 * OSレベルの接続状態。
 * navigator.onLine は「インターネットに到達できるか」までは保証しないが、
 * 機内モードのように接続そのものが無い状態は確実かつ即座に分かる。
 * Firestoreが切断を検知するまで数秒かかるため、その空白を埋める目的で使う。
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
