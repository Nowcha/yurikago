import { useEffect, useState } from 'react';

/**
 * 画面幅で構造そのものを変えたいとき用（CSSだけでは切り替えられない、
 * モーダルと右ペインの出し分けなど）。見た目だけの差はTailwindの md: 等で行う。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const sync = () => setMatches(list.matches);
    sync();
    list.addEventListener('change', sync);
    return () => list.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/** タスク詳細を右ペインに併置できる幅。Tailwindの xl (1280px) と揃える */
export const WIDE_SCREEN = '(min-width: 1280px)';
