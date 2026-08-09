import { useCallback, useEffect, useState } from 'react';

function readParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function writeParam(key: string, value: string | null): void {
  const params = new URLSearchParams(window.location.search);
  if (value === null || value === '') params.delete(key);
  else params.set(key, value);
  const query = params.toString();
  const base = window.location.pathname;
  // 履歴は積まない。絞り込みは「別のページ」ではないので戻るボタンの意味を壊さない
  window.history.replaceState(null, '', query ? `${base}?${query}` : base);
}

/**
 * URLのクエリを状態として使う。
 * リロードしても絞り込みが消えず、「期限超過だけ見て」とURLごと相手に送れる。
 * 既定値のときはクエリに残さないので、URLは必要な情報だけになる。
 */
export function useUrlState<T extends string>(
  key: string, fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => (readParam(key) as T | null) ?? fallback);

  const update = useCallback((next: T) => {
    setValue(next);
    writeParam(key, next === fallback ? null : next);
  }, [key, fallback]);

  useEffect(() => {
    const syncFromUrl = () => setValue((readParam(key) as T | null) ?? fallback);
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [key, fallback]);

  return [value, update];
}
