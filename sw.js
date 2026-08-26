const CACHE_NAME = "offline-ai-shell-v6";
const STATIC_ASSETS = [
    "./",
    "./index.html",
    "./css/styles.css",
    "./js/config.js",
    "./js/registry.js",
    "./js/db.js",
    "./js/storage-manager.js",
    "./js/download-manager.js",
    "./js/model-resolver.js",
    "./js/model-adapter.js",
    "./js/ai-engine.js",
    "./js/chat-controller.js",
    "./js/ui-manager.js",
    "./js/diagnostics.js",
    "./js/performance.js",
    "./js/app.js",
    "./assets/icon.svg",
    "./assets/logo.svg"
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch(() => {});
        })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && !key.startsWith("offline-ai-models")) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const url = event.request.url;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return;
    }

    if (url.includes("huggingface.co")) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache).catch(() => {});
                    });
                }
                return networkResponse;
            }).catch(() => {
                if (event.request.headers.get("accept")?.includes("text/html")) {
                    return caches.match("./index.html");
                }
                return new Response("Asset not found", { status: 404, statusText: "Not Found" });
            });
        })
    );
});
