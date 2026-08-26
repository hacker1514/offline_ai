class SystemDiagnostics {
    async getDiagnostics() {
        const hasGPU = !!navigator.gpu;
        let gpuInfo = "Not Available";

        if (hasGPU) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    gpuInfo = "WebGPU Adapter Active";
                }
            } catch (e) {
                gpuInfo = "WebGPU Request Error";
            }
        }

        const estimate = await window.storageManager.getEstimate();
        const persisted = await window.storageManager.isPersisted();

        return {
            webgpu: gpuInfo,
            storageUsage: window.storageManager.formatBytes(estimate.usage),
            storageQuota: window.storageManager.formatBytes(estimate.quota),
            storageAvailable: window.storageManager.formatBytes(estimate.available),
            isPersisted: persisted,
            activeModel: window.aiEngine.activeModel ? window.aiEngine.activeModel.name : "None",
            device: window.aiEngine.device
        };
    }
}

window.systemDiagnostics = new SystemDiagnostics();
