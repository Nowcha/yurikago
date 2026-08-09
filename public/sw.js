const CACHE = 'yurikago-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
