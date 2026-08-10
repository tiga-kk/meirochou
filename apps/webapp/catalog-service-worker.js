const CATALOG_CACHE_NAME = "comipath-catalog-v1";

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("comipath-catalog-") &&
                name !== CATALOG_CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.destination !== "image") {
    return;
  }

  event.respondWith(
    caches
      .open(CATALOG_CACHE_NAME)
      .then((cache) => cache.match(event.request))
      .then((cached) => cached ?? fetch(event.request))
      .catch(() => fetch(event.request)),
  );
});
