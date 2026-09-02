const CACHE = 'yurikago-v4';
// github.ioはユーザー単位で1オリジン。Cache Storageはスコープではなくオリジンで
// 分割されるため、絞り込まないと同じアカウントの別プロジェクトのキャッシュまで消える
const CACHE_PREFIX = 'yurikago-';

/**
 * アプリシェルを先読みする。
 * SWはページ読み込み後に登録されるので、初回訪問のHTML・JS・CSSはSWの管理外で
 * 取得されており、キャッシュに入っていない。そのため初回訪問の直後にオフラインへ
 * 移ると、次の起動でシェルが無く何も表示できなかった。
 * アセット名はビルド時のハッシュ付きでSW側からは分からないため、シェルHTMLから読み取る。
 */
async function precacheAppShell() {
  const shell = new URL('./', self.registration.scope).href;
  const res = await fetch(shell, { cache: 'no-cache' });
  if (!res.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put(shell, res.clone()); // 消費する前にcloneする
  const html = await res.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
    .map((m) => new URL(m[1], shell).href)
    .filter((url) => url.startsWith(self.registration.scope));
  await cache.addAll(assets);
}

self.addEventListener('install', (e) => {
  // 先読みが失敗してもインストールは止めない。従来どおり実行時キャッシュで動作する
  e.waitUntil(
    precacheAppShell().catch(() => {}).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Firestore/Auth等のAPI通信はSDKのオフライン機構に任せ、SWは触らない
  if (url.hostname.endsWith('googleapis.com') || url.hostname.includes('firebase')) return;

  // HTMLはネットワーク優先。アセットと違いファイル名が変わらないため、
  // キャッシュ優先だとデプロイ後の初回表示が必ず古い版になる（毎回リロード2回が必要になる）
  if (e.request.mode === 'navigate') {
    // fetch(e.request) だけではHTTPキャッシュ（GitHub Pagesはmax-age=600）から
    // 古いHTMLが返り、既に存在しないハッシュ付きJSを指して真っ白になる。
    // navigateモードのRequestは init 付きで再構築できないためURLから作り直す
    const fresh = new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' });
    e.respondWith(
      fetch(fresh)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        // オフライン時はクエリ違い（?tab=...）でも同じシェルを返す
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
    return;
  }

  // アセットはファイル名にハッシュが入るので stale-while-revalidate で安全
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          const cacheable =
            res.ok &&
            (url.origin === location.origin ||
              url.hostname === 'fonts.googleapis.com' ||
              url.hostname === 'fonts.gstatic.com');
          if (cacheable) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
