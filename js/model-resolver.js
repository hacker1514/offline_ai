class ModelResolver {
    constructor() {
        this.cacheName = window.KNI_CONFIG.MODEL_CACHE_NAME;
    }

    setupTransformersEnv(isInstalled = false) {
        if (window.TransformersJS && window.TransformersJS.env) {
            const env = window.TransformersJS.env;

            env.allowLocalModels = true;
            env.allowRemoteModels = !isInstalled; // If installed, strictly disable remote network checks!
            env.useBrowserCache = true;
            env.useCustomCache = false;

            if (env.backends && env.backends.onnx) {
                env.backends.onnx.wasm.numThreads = 4;
                env.backends.onnx.wasm.simd = true;
            }
        }
    }

    async resolveStatus(modelId) {
        const record = await window.dbInstance.get("models", modelId);
        if (!record) return "NOT_INSTALLED";
        return record.status || "NOT_INSTALLED";
    }

    async isFullyCached(model) {
        const repoBase = `${window.KNI_CONFIG.HF_CDN_BASE}/${model.modelId}/resolve/main`;
        for (const file of model.files) {
            const fileUrl = `${repoBase}/${file}`;
            const exists = await window.storageManager.hasModelResource(fileUrl);
            if (!exists) return false;
        }
        return true;
    }
}

window.modelResolver = new ModelResolver();
