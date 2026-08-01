export interface Page<T> {
  values: T[];
  nextCursor: string | null;
}

export async function collectAllPages<T>(
  loadPage: (cursor: string | null) => Promise<Page<T>>,
): Promise<T[]> {
  const values: T[] = [];
  const visitedCursors = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const page = await loadPage(cursor);
    values.push(...page.values);

    if (page.nextCursor === null) return values;
    if (page.nextCursor === cursor || visitedCursors.has(page.nextCursor)) {
      throw new Error('Pagination cursor did not advance');
    }

    visitedCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
