class DownloadManager {
    constructor() {
        this.activeDownloads = new Map();
        this.queue = [];
        this.maxConcurrent = window.KNI_CONFIG.MAX_CONCURRENT_DOWNLOADS;
        this.listeners = new Set();
    }

    addListener(callback) {
        this.listeners.add(callback);
    }

    removeListener(callback) {
        this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        for (const listener of this.listeners) {
            try {
                listener(event, data);
            } catch (err) {}
        }
    }

    async startDownload(model) {
        await window.dbInstance.init();

        const existingModelRecord = await window.dbInstance.get("models", model.id);
        if (existingModelRecord && existingModelRecord.status === "INSTALLED") {
            this.notifyListeners("STATE_CHANGED", { modelId: model.id, status: "INSTALLED" });
            return;
        }

        const preflight = await window.storageManager.preflightCheck(model.sizeBytes);
        if (!preflight.ok) {
            this.notifyListeners("STORAGE_ERROR", { model, message: preflight.message });
            throw new Error(preflight.message);
        }

        const downloadRecord = {
            id: model.id,
            modelId: model.id,
            modelName: model.name,
            status: "DOWNLOADING",
            downloadedBytes: 0,
            totalBytes: model.sizeBytes,
            speedBytesPerSec: 0,
            etaSeconds: 0,
            startedAt: Date.now(),
            updatedAt: Date.now(),
            error: null
        };

        await window.dbInstance.put("downloads", downloadRecord);
        await window.dbInstance.put("models", {
            id: model.id,
            version: model.version,
            status: "DOWNLOADING",
            totalSize: model.sizeBytes,
            downloadedSize: 0,
            runtime: model.runtime
        });

        this.notifyListeners("STATE_CHANGED", { modelId: model.id, status: "DOWNLOADING" });
        this.notifyListeners("PROGRESS", {
            modelId: model.id,
            downloadedBytes: 0,
            totalBytes: model.sizeBytes,
            percent: 0,
            speedBytesPerSec: 0,
            etaSeconds: 0
        });

        this.executeDownload(model);
    }

    async executeDownload(model) {
        let lastLoadedBytes = 0;
        let lastTime = Date.now();

        try {
            window.modelResolver.setupTransformersEnv();

            if (!window.TransformersJS || !window.TransformersJS.pipeline) {
                throw new Error("Transformers.js engine bundle is not loaded.");
            }

            const pipelineFunc = window.TransformersJS.pipeline;

            const pipe = await pipelineFunc(model.task || "text-generation", model.modelId, {
                device: window.aiEngine.device || "wasm",
                dtype: model.dtype || "q4",
                progress_callback: (info) => {
                    if (info.status === "progress") {
                        const now = Date.now();
                        const timeDiff = (now - lastTime) / 1000;
                        const loaded = info.loaded || 0;
                        const total = info.total || model.sizeBytes;
                        const progress = info.progress || (loaded / total) * 100;

                        let speed = 0;
                        if (timeDiff >= 0.3) {
                            speed = Math.round((loaded - lastLoadedBytes) / timeDiff);
                            lastTime = now;
                            lastLoadedBytes = loaded;
                        }

                        const remainingBytes = Math.max(0, total - loaded);
                        const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

                        const progressData = {
                            modelId: model.id,
                            downloadedBytes: loaded,
                            totalBytes: total,
                            percent: Math.min(100, Math.round(progress)),
                            speedBytesPerSec: speed,
                            etaSeconds: eta,
                            currentFile: info.file || "weights"
                        };

                        this.notifyListeners("PROGRESS", progressData);

                        window.dbInstance.put("downloads", {
                            id: model.id,
                            modelId: model.id,
                            modelName: model.name,
                            status: "DOWNLOADING",
                            downloadedBytes: loaded,
                            totalBytes: total,
                            speedBytesPerSec: speed,
                            etaSeconds: eta,
                            updatedAt: now
                        }).catch(() => {});
                    }
                }
            });

            window.aiEngine.activePipeline = pipe;
            window.aiEngine.activeModel = model;

            await window.dbInstance.put("downloads", {
                id: model.id,
                modelId: model.id,
                modelName: model.name,
                status: "INSTALLED",
                downloadedBytes: model.sizeBytes,
                totalBytes: model.sizeBytes,
                updatedAt: Date.now()
            });

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

            this.notifyListeners("STATE_CHANGED", { modelId: model.id, status: "INSTALLED" });
            window.uiManager.showToast(`Model ${model.name} downloaded & ready offline!`, "success");

        } catch (err) {
            await window.dbInstance.put("downloads", {
                id: model.id,
                modelId: model.id,
                status: "ERROR",
                error: err.message,
                updatedAt: Date.now()
            });
            await window.dbInstance.put("models", {
                id: model.id,
                status: "ERROR"
            });
            this.notifyListeners("STATE_CHANGED", { modelId: model.id, status: "ERROR", error: err.message });
            window.uiManager.showToast(`Failed to download ${model.name}: ${err.message}`, "error");
        }
    }

    cancelDownload(modelId) {
        this.activeDownloads.delete(modelId);
        window.dbInstance.put("models", { id: modelId, status: "NOT_INSTALLED" }).catch(() => {});
        this.notifyListeners("STATE_CHANGED", { modelId, status: "NOT_INSTALLED" });
    }

    formatSpeed(bytesPerSec) {
        if (bytesPerSec >= 1048576) {
            return (bytesPerSec / 1048576).toFixed(1) + " MB/s";
        }
        return (bytesPerSec / 1024).toFixed(0) + " KB/s";
    }

    formatETA(seconds) {
        if (seconds <= 0) return "0s";
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }
}

window.downloadManager = new DownloadManager();
