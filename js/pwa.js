let deferredPrompt = null;

function isAppStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.matchMedia("(display-mode: minimal-ui)").matches ||
           window.navigator.standalone === true;
}

function isAppMarkedInstalled() {
    return isAppStandalone() || localStorage.getItem("lwm_app_installed") === "true";
}

function hideInstallButton() {
    const btnInstall = document.getElementById("btn-install-app");
    if (btnInstall) {
        btnInstall.classList.add("hidden");
        btnInstall.style.display = "none";
    }
}

function showInstallButton() {
    const btnInstall = document.getElementById("btn-install-app");
    if (btnInstall && !isAppMarkedInstalled()) {
        btnInstall.classList.remove("hidden");
        btnInstall.style.display = "inline-flex";
    }
}

// Catch beforeinstallprompt as early as possible.
// Chrome ONLY fires beforeinstallprompt if the app is NOT already installed.
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // If Chrome offers beforeinstallprompt, app is not installed
    if (localStorage.getItem("lwm_app_installed") === "true" && !isAppStandalone()) {
        localStorage.removeItem("lwm_app_installed");
    }

    if (!isAppStandalone()) {
        showInstallButton();
    } else {
        hideInstallButton();
    }
});

window.addEventListener("DOMContentLoaded", () => {
    // Keep button hidden initially on page load if app is installed or prompt hasn't fired
    if (isAppMarkedInstalled()) {
        hideInstallButton();
    } else if (deferredPrompt) {
        showInstallButton();
    } else {
        hideInstallButton();
    }

    // Register service worker
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js").then((reg) => {
            console.log("[LWM] Service Worker registered successfully for offline support.", reg);
            reg.update();
        }).catch((err) => {
            console.warn("[LWM] Service Worker registration failed:", err);
        });
    }

    // Also check getInstalledRelatedApps if supported
    if ("getInstalledRelatedApps" in navigator) {
        navigator.getInstalledRelatedApps().then((apps) => {
            if (apps && apps.length > 0) {
                localStorage.setItem("lwm_app_installed", "true");
                hideInstallButton();
            }
        }).catch(() => {});
    }

    const btnInstall = document.getElementById("btn-install-app");
    if (btnInstall) {
        btnInstall.addEventListener("click", async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === "accepted") {
                    localStorage.setItem("lwm_app_installed", "true");
                    hideInstallButton();
                }
                deferredPrompt = null;
            } else {
                if (window.uiManager) {
                    window.uiManager.showToast("To install LWM App: Click Chrome address bar icon (⊕) or menu -> 'Install LWM'", "info");
                }
            }
        });
    }
});

window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    localStorage.setItem("lwm_app_installed", "true");
    hideInstallButton();
    if (window.uiManager) {
        window.uiManager.showToast("LWM Installed successfully as Standalone App!", "success");
    }
});

// Hide button dynamically if launched in standalone app window
try {
    window.matchMedia("(display-mode: standalone)").addEventListener("change", (e) => {
        if (e.matches) {
            localStorage.setItem("lwm_app_installed", "true");
            hideInstallButton();
        }
    });
} catch (e) {}
