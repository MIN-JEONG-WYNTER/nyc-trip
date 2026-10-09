// 오프라인에서도 앱이 열리게 하는 서비스 워커.
// 앱 파일은 "네트워크 먼저, 안 되면 저장본" — 온라인이면 항상 최신 코드를 받고, 지하철 등 오프라인이면 마지막 저장본으로 연다.
// 데이터(일정)는 원래 localStorage에 있으므로 따로 저장하지 않는다.
const CACHE = "nyc-trip-v3";
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/areas.js",
  "js/categories.js",
  "js/geo.js",
  "js/google-data.js",
  "js/hours.js",
  "js/optimizer.js",
  "js/requests.js",
  "js/search.js",
  "js/seed.js",
  "js/store.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (e) => {
  // 하나가 실패해도(예: unpkg 일시 장애) 나머지는 저장되게
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, u.startsWith("http") ? { mode: "cors" } : {})).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isShell = url.origin === self.location.origin || url.href.startsWith("https://unpkg.com/leaflet@1.9.4/");
  if (!isShell) return; // API·지도 타일은 그대로
  e.respondWith(
    // 브라우저 HTTP 캐시(GitHub Pages는 10분)를 건너뛰고 서버에 새 버전이 있는지 매번 확인 (바뀐 게 없으면 304라 가볍다)
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          const key = url.origin + url.pathname; // ?쿼리마다 따로 쌓이지 않게
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(url.origin + url.pathname).then((r) => r || (req.mode === "navigate" ? caches.match(new URL("index.html", self.registration.scope).href) : Response.error())),
      ),
  );
});
