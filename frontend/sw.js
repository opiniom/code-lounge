/* DureSync 서비스 워커 (PWA).
   목적: ① 앱을 설치할 수 있게 하고 ② 화면 파일(CSS·JS·아이콘)을 기기에 보관해 다시 열 때 빠르게 하고 ③ 연결이 끊기면 '오프라인' 안내를 보여준다.
   하지 않는 것(중요): 로그인·채팅·파일 같은 서버 데이터(/api, /ws)는 절대 가로채거나 저장하지 않는다 → 오래된 데이터나 남의 로그인 정보가 남을 일이 없다.
   서버가 __BUILD__ 를 화면 버전으로 바꿔서 내려주므로, 화면이 바뀌면 이 파일도 바뀌어 새 버전으로 자동 교체된다. */
const BUILD = '__BUILD__';
const CACHE = 'duresync-shell-' + BUILD;
const PRECACHE = [
  '/static/offline.html',
  '/static/icons/icon-light-192.png', '/static/icons/icon-dark-192.png',
  '/static/bundle.css?v=' + BUILD, '/static/bundle.js?v=' + BUILD,
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 하나가 실패해도 설치 전체가 막히지 않게 하나씩 담는다
      return Promise.all(PRECACHE.map(function (url) { return cache.add(url).catch(function () {}); }));
    })
  );
  // 바로 교체하지 않는다: 사용자가 쓰던 화면이 갑자기 새 코드로 바뀌지 않게, 화면이 "새로고침" 신호를 줄 때 교체
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k.indexOf('duresync-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));   // 이전 버전 보관분 정리
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.disable(); } catch (e) {} }   // 끈다: 켜 두면 서비스 워커가 맡지 않는 주소(/api/auth/…/callback)로 이동할 때 같은 요청이 두 번 나가서, 한 번만 쓸 수 있는 소셜 로그인 코드가 두 번째에 거부된다
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isApp(url) {
  const p = url.pathname;
  return !(p.indexOf('/api/') === 0 || p.indexOf('/ws/') === 0 || p === '/health' || p === '/sw.js' || p === '/manifest.webmanifest' || p.indexOf('/docs') === 0 || p.indexOf('/openapi') === 0);
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;                       // 저장·수정 요청은 건드리지 않는다
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !isApp(url)) return;   // 다른 사이트(CDN·구글 로그인)와 서버 데이터는 그대로 통과

  // 화면 이동: 네트워크가 먼저. 연결이 없을 때만 오프라인 안내 (HTML 은 항상 최신이어야 해서 보관하지 않는다)
  if (req.mode === 'navigate') {
    event.respondWith((async function () {
      try {
        return await fetch(req);
      } catch (e) {
        const off = await caches.match('/static/offline.html');
        return off || new Response('오프라인이에요', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  const p = url.pathname;
  // 화면 묶음 파일: 주소의 ?v= 가 버전이라 내용이 같다 → 보관분을 바로 쓴다 (없으면 받아서 보관)
  if (p === '/static/bundle.css' || p === '/static/bundle.js') {
    event.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  // 아이콘·오프라인 화면: 보관분을 먼저 보여 주고 뒤에서 새로 받아 둔다
  if (p.indexOf('/static/icons/') === 0 || p === '/static/offline.html') {
    event.respondWith(caches.match(req).then(function (hit) {
      const net = fetch(req).then(function (res) {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    }));
  }
  // 그 밖의 파일은 가로채지 않는다 (브라우저 기본 동작)
});
