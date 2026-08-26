document.addEventListener("DOMContentLoaded", async () => {
    if ("serviceWorker" in navigator) {
        try {
            const reg = await navigator.serviceWorker.register("sw.js");
            reg.update();
        } catch (err) {}
    }

    await window.dbInstance.init();
    await window.storageManager.getEstimate();
    await window.storageManager.syncInstalledModelsFromCache();
    await window.aiEngine.detectHardware();
    await window.chatController.init();

    window.uiManager.updateSystemStatus();
    window.uiManager.switchView("chat");

    window.addEventListener("online", () => {
        window.uiManager.updateSystemStatus();
        window.downloadManager.resumeInterruptedDownloads();
    });

    window.addEventListener("offline", () => {
        window.uiManager.showToast("Network offline. Local engine active.", "warning");
        window.uiManager.updateSystemStatus();
    });
});
