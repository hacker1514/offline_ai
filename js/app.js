document.addEventListener("DOMContentLoaded", async () => {
    if ("serviceWorker" in navigator) {
        try {
            const reg = await navigator.serviceWorker.register("sw.js");
            reg.update();

            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                if (installingWorker) {
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                            window.location.reload();
                        }
                    };
                }
            };
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
        window.uiManager.showToast("Network connected. Downloads available.", "info");
        window.uiManager.updateSystemStatus();
    });

    window.addEventListener("offline", () => {
        window.uiManager.showToast("Network offline. Local engine active.", "warning");
        window.uiManager.updateSystemStatus();
    });
});
