/**
 * Firestoreの書き込みは「ローカルに反映されたか」と「サーバーが受理したか」が別物である。
 * オフラインキャッシュ有効時、後者が起きなくても画面上は成功に見えるため明示的に扱う。
 */

const SERVER_ACK_TIMEOUT_MS = 10_000;

/** サーバーACKを待つ。返らなければ未送信として扱い、成功と誤認させない */
export async function withServerAck<T>(write: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('server-ack-timeout')), SERVER_ACK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([write, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function describeWriteError(error: unknown): string {
  if (error instanceof Error && error.message === 'server-ack-timeout') {
    return 'サーバーに反映できませんでした。画面上は変わって見えても、相手にはまだ届いていません。'
      + '通信状況を確認してから、この画面を開き直して結果を確認してください。';
  }
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
  if (code === 'permission-denied') {
    return 'この世帯を編集する権限がありません（permission-denied）。';
  }
  return code ? `保存できませんでした（${code}）。` : '保存できませんでした。もう一度お試しください。';
}
