class StorageManager {
    constructor() {
        this.cacheName = window.KNI_CONFIG.MODEL_CACHE_NAME;
        this.tfCacheName = "transformers-cache";
    }

    async getEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const available = Math.max(0, quota - usage);
            return { usage, quota, available };
        }
        return { usage: 0, quota: 0, available: 0 };
    }

    async isPersisted() {
        if (navigator.storage && navigator.storage.persisted) {
            return await navigator.storage.persisted();
        }
        return false;
    }

    async requestPersist() {
        if (navigator.storage && navigator.storage.persist) {
            return await navigator.storage.persist();
        }
        return false;
    }

    async preflightCheck(requiredBytes) {
        const { available } = await this.getEstimate();
        const safetyMargin = 52428800;
        if (available > 0 && available < (requiredBytes + safetyMargin)) {
            return {
                ok: false,
                available,
                required: requiredBytes,
                message: `Insufficient storage space. Required: ${this.formatBytes(requiredBytes)}, Available: ${this.formatBytes(available)}.`
            };
        }
        return { ok: true, available, required: requiredBytes };
    }

    async syncInstalledModelsFromCache() {
        await window.dbInstance.init();
        try {
            const kniCache = await caches.open(this.cacheName);
            const tfCache = await caches.open(this.tfCacheName);

            const keys1 = await kniCache.keys();
            const keys2 = await tfCache.keys();
            const allUrls = [...keys1.map(r => r.url), ...keys2.map(r => r.url)];

            let syncedCount = 0;

            for (const model of window.MODEL_REGISTRY) {
                const isCached = allUrls.some(url => url.includes(model.modelId) || url.includes(model.id));
                if (isCached) {
                    await window.dbInstance.put("models", {
                        id: model.id,
                        version: model.version,
                        status: "INSTALLED",
                        installedAt: Date.now(),
                        totalSize: model.sizeBytes,
                        downloadedSize: model.sizeBytes,
                        runtime: model.runtime,
                        lastUsedAt: Date.now()
                    });
                    syncedCount++;
                }
            }

            return syncedCount;
        } catch (err) {
            return 0;
        }
    }

    async saveModelResource(url, data) {
        const kniCache = await caches.open(this.cacheName);
        const tfCache = await caches.open(this.tfCacheName);

        const createRes = (input) => {
            if (input instanceof Response) return input.clone();
            if (input instanceof Blob) {
                return new Response(input, {
                    status: 200,
                    statusText: "OK",
                    headers: { "Content-Type": "application/octet-stream" }
                });
            }
            return new Response(new Blob([input]), {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/octet-stream" }
            });
        };

        try {
            const res1 = createRes(data);
            await kniCache.put(url, res1);

            const res2 = createRes(data);
            await tfCache.put(url, res2);
        } catch (err) {}
    }

    async hasModelResource(url) {
        const cache = await caches.open(this.cacheName);
        const match = await cache.match(url);
        if (match) return true;

        const tfCache = await caches.open(this.tfCacheName);
        const tfMatch = await tfCache.match(url);
        return !!tfMatch;
    }

    async getModelResource(url) {
        const cache = await caches.open(this.cacheName);
        const match = await cache.match(url);
        if (match) return match;

        const tfCache = await caches.open(this.tfCacheName);
        return await tfCache.match(url);
    }

    async removeModelResources(modelId, repository) {
        const kniCache = await caches.open(this.cacheName);
        const tfCache = await caches.open(this.tfCacheName);

        let deletedCount = 0;

        for (const cacheObj of [kniCache, tfCache]) {
            const keys = await cacheObj.keys();
            for (const request of keys) {
                if (request.url.includes(repository) || request.url.includes(modelId)) {
                    await cacheObj.delete(request);
                    deletedCount++;
                }
            }
        }
        return deletedCount;
    }

    formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

window.storageManager = new StorageManager();
