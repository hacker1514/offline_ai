const CACHE_NAME = "lwm-shell-v12";
const MODEL_CACHE_NAME = "offline-ai-models-v1";
const TF_CACHE_NAME = "transformers-cache";

const STATIC_ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",
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
    "./js/pwa.js",
    "./js/app.js",
    "./assets/icon.svg",
    "./assets/logo.svg",
    "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap",
    "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/tokyo-night-dark.min.css",
    "https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js",
    "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/highlight.min.js",
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3"
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.all(
                STATIC_ASSETS.map((url) => {
                    return cache.add(url).catch((err) => {
                        console.warn("[SW] Precache asset skipped/failed:", url, err);
                    });
                })
            );
        })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    // PRESERVE MODEL WEIGHT CACHES PERMANENTLY!
                    if (
                        key !== CACHE_NAME &&
                        !key.startsWith("offline-ai-models") &&
                        key !== "transformers-cache"
                    ) {
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

    // CACHE-FIRST STRATEGY FOR ALL APP SHELL & CDN ASSETS FOR FULL OFFLINE AVAILABILITY
    event.respondWith(
        caches.match(event.request, { ignoreSearch: false }).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached resource immediately for instant offline load
                return cachedResponse;
            }

            // Check secondary caches (transformers-cache, model weight cache)
            return caches.match(event.request, { cacheName: TF_CACHE_NAME }).then((tfMatch) => {
                if (tfMatch) return tfMatch;

                return caches.match(event.request, { cacheName: MODEL_CACHE_NAME }).then((modelMatch) => {
                    if (modelMatch) return modelMatch;

                    // If not in cache, fetch from network and store in CACHE_NAME
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === "opaque")) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache).catch(() => {});
                            });
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Offline fallback for HTML navigation requests
                        if (
                            event.request.headers.get("accept")?.includes("text/html") ||
                            event.request.mode === "navigate"
                        ) {
                            return caches.match("./index.html").then((htmlMatch) => {
                                return htmlMatch || caches.match("/");
                            });
                        }
                        return new Response("Offline asset not cached", { status: 404 });
                    });
                });
            });
        })
    );
});
