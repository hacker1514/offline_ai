const CACHE_NAME = "lwm-shell-v11";
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
                    // PRESERVE MODEL WEIGHT CACHES PERMANENTLY!
                    // Do NOT delete transformers-cache or offline-ai-models
                    if (key !== CACHE_NAME && !key.startsWith("offline-ai-models") && key !== "transformers-cache") {
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

    // Direct native browser pass-through for ONNX model weights, WASM binaries, and external CDNs
    if (
        url.includes("huggingface.co") ||
        url.includes(".onnx") ||
        url.includes(".wasm") ||
        url.includes("model_quantized") ||
        url.includes("cdn.jsdelivr.net") ||
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.gstatic.com")
    ) {
        return;
    }

    // NETWORK-FIRST STRATEGY FOR LOCAL APP SHELL (HTML, JS, CSS)
    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache).catch(() => {});
                });
            }
            return networkResponse;
        }).catch(() => {
            return caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                if (event.request.headers.get("accept")?.includes("text/html")) {
                    return caches.match("./index.html");
                }
                return new Response("Offline asset not cached", { status: 404 });
            });
        })
    );
});
