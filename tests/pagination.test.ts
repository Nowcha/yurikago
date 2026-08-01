import { describe, expect, it, vi } from 'vitest';
import { collectAllPages, type Page } from '../src/lib/pagination';

describe('collectAllPages', () => {
  it('300件を超えるデータを最終ページまで収集する', async () => {
    const firstPage = Array.from({ length: 300 }, (_, index) => index);
    const loadPage = vi.fn(async (cursor: string | null): Promise<Page<number>> => {
      if (cursor === null) return { values: firstPage, nextCursor: 'page-2' };
      if (cursor === 'page-2') return { values: [300, 301], nextCursor: null };
      throw new Error(`Unexpected cursor: ${cursor}`);
    });

    const result = await collectAllPages(loadPage);

    expect(result).toHaveLength(302);
    expect(result.at(-1)).toBe(301);
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('空のコレクションでは空配列を返す', async () => {
    const loadPage = vi.fn(async (): Promise<Page<number>> => ({
      values: [],
      nextCursor: null,
    }));

    await expect(collectAllPages(loadPage)).resolves.toEqual([]);
  });

  it('同じカーソルが返された場合は無限ループせず失敗する', async () => {
    const loadPage = vi.fn(async (): Promise<Page<number>> => ({
      values: [1],
      nextCursor: 'stuck',
    }));

    await expect(collectAllPages(loadPage)).rejects.toThrow('Pagination cursor did not advance');
    expect(loadPage).toHaveBeenCalledTimes(2);
  });
});
