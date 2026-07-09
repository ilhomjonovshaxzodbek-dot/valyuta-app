const CACHE_NAME = "valyuta-app-v3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./auth.js",
  "./currencies.js",
  "./units.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Saytimizning o'z fayllari uchun: avval TARMOQDAN yangisini olishga harakat qilamiz
// (shunda yangilanishlar darhol ko'rinadi), faqat internet sekin/yo'q bo'lsa keshdan
// foydalanamiz. Tarmoq so'roviga vaqt chegarasi qo'yamiz — aks holda sekin internetda
// ilova cheksiz "yuklanmoqda" holatida qolib ketishi mumkin.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // tashqi API - tegmaymiz

  event.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(async () => {
        if (settled) return;
        const cached = await caches.match(event.request);
        if (cached) {
          settled = true;
          resolve(cached);
        }
      }, 2500);

      fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(res);
          }
        })
        .catch(async () => {
          if (settled) return;
          clearTimeout(timer);
          const cached = await caches.match(event.request);
          settled = true;
          resolve(cached || Response.error());
        });
    })
  );
});
