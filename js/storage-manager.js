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
            const allUrls = [];
            if (typeof caches !== "undefined" && caches.keys) {
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    try {
                        const cacheObj = await caches.open(cacheName);
                        const keys = await cacheObj.keys();
                        for (const r of keys) {
                            allUrls.push(r.url.toLowerCase());
                        }
                    } catch (e) {}
                }
            }

            let syncedCount = 0;

            for (const model of window.MODEL_REGISTRY) {
                const isActiveInEngine = window.aiEngine && window.aiEngine.activeModel && window.aiEngine.activeModel.id === model.id;
                
                const modelIdLower = (model.id || "").toLowerCase();
                const repositoryLower = (model.modelId || "").toLowerCase();
                const repoNameLower = repositoryLower.includes("/") ? repositoryLower.split("/").pop() : repositoryLower;

                const hasOnnxWeight = isActiveInEngine || allUrls.some(url =>
                    (url.includes(repositoryLower) || url.includes(modelIdLower) || (repoNameLower && url.includes(repoNameLower))) &&
                    (url.includes(".onnx") || url.includes("model_quantized") || url.includes("model_q4") || url.includes("onnx") || url.includes("resolve"))
                );

                if (hasOnnxWeight) {
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
                } else if (!isActiveInEngine) {
                    const dbRecord = await window.dbInstance.get("models", model.id);
                    if (dbRecord && dbRecord.status === "INSTALLED") {
                        await window.dbInstance.put("models", {
                            id: model.id,
                            version: model.version,
                            status: "NOT_INSTALLED",
                            installedAt: null,
                            totalSize: 0,
                            downloadedSize: 0,
                            runtime: model.runtime
                        });
                    }
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
        let regModel = null;
        if (window.MODEL_REGISTRY) {
            regModel = window.MODEL_REGISTRY.find(m => m.id === modelId || m.modelId === repository || m.id === repository);
        }

        const targets = new Set();
        if (modelId) targets.add(modelId.toLowerCase());
        if (repository) {
            targets.add(repository.toLowerCase());
            if (repository.includes("/")) {
                const parts = repository.split("/");
                targets.add(parts[parts.length - 1].toLowerCase());
            }
        }
        if (regModel) {
            if (regModel.id) targets.add(regModel.id.toLowerCase());
            if (regModel.modelId) {
                targets.add(regModel.modelId.toLowerCase());
                if (regModel.modelId.includes("/")) {
                    targets.add(regModel.modelId.split("/").pop().toLowerCase());
                }
            }
            if (regModel.name) {
                const cleanedName = regModel.name.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (cleanedName.length > 3) targets.add(cleanedName);
            }
        }

        const searchTerms = Array.from(targets).filter(t => t && t.length > 2);

        let deletedCount = 0;

        // 1. Chrome Cache Storage (Clear across ALL cache stores)
        try {
            if (typeof caches !== "undefined" && caches.keys) {
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    try {
                        const cacheObj = await caches.open(cacheName);
                        const keys = await cacheObj.keys();
                        for (const request of keys) {
                            const urlLower = request.url.toLowerCase();
                            const isMatch = searchTerms.some(term => urlLower.includes(term));
                            if (isMatch) {
                                await cacheObj.delete(request);
                                deletedCount++;
                            }
                        }
                    } catch (e) {
                        console.warn(`[StorageManager] Error cleaning cache store '${cacheName}':`, e);
                    }
                }
            }
        } catch (e) {
            console.warn("[StorageManager] Error accessing Cache Storage:", e);
        }

        // 2. Chrome Extension Storage API (chrome.storage.local, chrome.storage.sync, chrome.storage.session)
        if (typeof chrome !== "undefined" && chrome?.storage) {
            const storageAreas = ["local", "sync", "session"];
            for (const area of storageAreas) {
                if (chrome.storage[area] && typeof chrome.storage[area].get === "function") {
                    try {
                        const data = await new Promise((resolve) => {
                            chrome.storage[area].get(null, (items) => resolve(items || {}));
                        });
                        const keysToRemove = [];
                        for (const [key, value] of Object.entries(data)) {
                            const keyLower = key.toLowerCase();
                            const valString = typeof value === "string" ? value.toLowerCase() : JSON.stringify(value).toLowerCase();
                            if (searchTerms.some(term => keyLower.includes(term) || valString.includes(term))) {
                                keysToRemove.push(key);
                            }
                        }
                        if (keysToRemove.length > 0) {
                            await new Promise((resolve) => {
                                chrome.storage[area].remove(keysToRemove, () => resolve());
                            });
                            console.log(`[StorageManager] Removed ${keysToRemove.length} keys from chrome.storage.${area}`);
                        }
                    } catch (e) {
                        console.warn(`[StorageManager] Error cleaning chrome.storage.${area}:`, e);
                    }
                }
            }
        }

        // 3. Origin Private File System (OPFS)
        if (navigator.storage && navigator.storage.getDirectory) {
            try {
                const root = await navigator.storage.getDirectory();
                const removeMatchingOPFS = async (dirHandle) => {
                    for await (const [name, handle] of dirHandle.entries()) {
                        const nameLower = name.toLowerCase();
                        if (searchTerms.some(term => nameLower.includes(term))) {
                            await dirHandle.removeEntry(name, { recursive: true }).catch(() => {});
                        } else if (handle.kind === "directory") {
                            await removeMatchingOPFS(handle).catch(() => {});
                        }
                    }
                };
                await removeMatchingOPFS(root);
            } catch (e) {}
        }

        // 4. LocalStorage & SessionStorage
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const keyLower = key.toLowerCase();
                    const valLower = (localStorage.getItem(key) || "").toLowerCase();
                    if (key !== "offline_ai_gen_settings" && key !== "offline_ai_sidebar_collapsed" && key !== "lwm_app_installed") {
                        if (searchTerms.some(term => keyLower.includes(term) || valLower.includes(term))) {
                            keysToRemove.push(key);
                        }
                    }
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch (e) {}

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
