class UIManager {
    constructor() {
        this.currentView = "chat";
        this.activeCategory = "all";
        this.searchQuery = "";
        this.pendingRemovalModel = null;

        this.initDOMReferences();
        this.restoreSidebarState();
        this.bindEvents();
    }

    initDOMReferences() {
        this.navItems = document.querySelectorAll(".nav-item[data-view]");
        this.viewPanels = document.querySelectorAll(".view-panel");
        this.sidebar = document.getElementById("sidebar");
        this.sidebarBackdrop = document.getElementById("sidebar-backdrop");
        this.btnSidebarToggle = document.getElementById("btn-sidebar-toggle");
        this.btnSidebarOpen = document.getElementById("btn-sidebar-open");

        this.storeSearchInput = document.getElementById("store-search-input");
        this.categoryTabs = document.getElementById("category-tabs");
        this.storeGrid = document.getElementById("models-store-grid");

        this.installedGrid = document.getElementById("installed-models-grid");

        this.storageUsedVal = document.getElementById("storage-used-val");
        this.storageAvailVal = document.getElementById("storage-avail-val");
        this.storagePersistVal = document.getElementById("storage-persist-val");
        this.storageBarFill = document.getElementById("storage-bar-fill");
        this.storageTableBody = document.getElementById("storage-table-body");
        this.btnRequestPersist = document.getElementById("btn-request-persist");

        this.modalDiagnostics = document.getElementById("modal-diagnostics");
        this.modalRemoveConfirm = document.getElementById("modal-remove-confirm");
        this.modalModelDetail = document.getElementById("modal-model-detail");
        this.modalReportProblem = document.getElementById("modal-report-problem");
        this.btnSystemStatus = document.getElementById("btn-system-status");
        this.btnOpenDiagnostics = document.getElementById("btn-open-diagnostics");
        this.btnOpenReport = document.getElementById("btn-open-report");
        this.btnSendReportMail = document.getElementById("btn-send-report-mail");
        this.reportSubjectInput = document.getElementById("report-issue-subject");
        this.reportBodyInput = document.getElementById("report-issue-body");
        this.btnConfirmRemoveExecute = document.getElementById("btn-confirm-remove-execute");

        this.toastContainer = document.getElementById("toast-container");
    }

    restoreSidebarState() {
        if (!this.sidebar) return;
        if (window.innerWidth <= 768) return;

        const isCollapsed = localStorage.getItem("offline_ai_sidebar_collapsed") === "true";
        if (isCollapsed) {
            this.sidebar.classList.add("collapsed");
            if (this.btnSidebarOpen) this.btnSidebarOpen.classList.remove("hidden");
        } else {
            this.sidebar.classList.remove("collapsed");
            if (this.btnSidebarOpen) this.btnSidebarOpen.classList.add("hidden");
        }
    }

    bindEvents() {
        this.navItems.forEach(item => {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view);
                if (window.innerWidth <= 768) {
                    this.sidebar.classList.remove("mobile-open");
                    if (this.sidebarBackdrop) this.sidebarBackdrop.classList.remove("active");
                }
            });
        });

        if (this.btnSidebarToggle) {
            this.btnSidebarToggle.addEventListener("click", () => {
                if (window.innerWidth <= 768) {
                    this.sidebar.classList.remove("mobile-open");
                    if (this.sidebarBackdrop) this.sidebarBackdrop.classList.remove("active");
                } else {
                    this.sidebar.classList.add("collapsed");
                    if (this.btnSidebarOpen) this.btnSidebarOpen.classList.remove("hidden");
                    localStorage.setItem("offline_ai_sidebar_collapsed", "true");
                }
            });
        }

        if (this.btnSidebarOpen) {
            this.btnSidebarOpen.addEventListener("click", () => {
                if (window.innerWidth <= 768) {
                    this.sidebar.classList.add("mobile-open");
                    if (this.sidebarBackdrop) this.sidebarBackdrop.classList.add("active");
                } else {
                    this.sidebar.classList.remove("collapsed");
                    if (this.btnSidebarOpen) this.btnSidebarOpen.classList.add("hidden");
                    localStorage.setItem("offline_ai_sidebar_collapsed", "false");
                }
            });
        }

        if (this.sidebarBackdrop) {
            this.sidebarBackdrop.addEventListener("click", () => {
                this.sidebar.classList.remove("mobile-open");
                this.sidebarBackdrop.classList.remove("active");
            });
        }

        if (this.storeSearchInput) {
            this.storeSearchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderModelStore();
            });
        }

        if (this.categoryTabs) {
            this.categoryTabs.addEventListener("click", (e) => {
                const tab = e.target.closest(".cat-tab");
                if (tab) {
                    document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
                    tab.classList.add("active");
                    this.activeCategory = tab.dataset.category;
                    this.renderModelStore();
                }
            });
        }

        if (this.btnSystemStatus) {
            this.btnSystemStatus.addEventListener("click", () => {
                this.openDiagnosticsModal();
            });
        }

        if (this.btnOpenDiagnostics) {
            this.btnOpenDiagnostics.addEventListener("click", () => {
                this.openDiagnosticsModal();
            });
        }

        if (this.btnOpenReport) {
            this.btnOpenReport.addEventListener("click", () => {
                if (this.modalReportProblem) {
                    this.modalReportProblem.classList.remove("hidden");
                }
            });
        }

        if (this.btnSendReportMail) {
            this.btnSendReportMail.addEventListener("click", () => {
                const subject = encodeURIComponent(this.reportSubjectInput ? this.reportSubjectInput.value.trim() : "LWM Issue Report");
                const body = encodeURIComponent(this.reportBodyInput ? this.reportBodyInput.value.trim() : "");
                const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=hackerenvironment1514@gmail.com&su=${subject}&body=${body}`;
                window.open(gmailWebUrl, '_blank');
                if (this.modalReportProblem) {
                    this.modalReportProblem.classList.add("hidden");
                }
                this.showToast("Opening Gmail Web...", "info");
            });
        }

        document.querySelectorAll(".modal-close").forEach(btn => {
            btn.addEventListener("click", () => {
                const modalId = btn.dataset.modal;
                if (modalId) {
                    document.getElementById(modalId).classList.add("hidden");
                }
            });
        });

        if (this.btnRequestPersist) {
            this.btnRequestPersist.addEventListener("click", async () => {
                const granted = await window.storageManager.requestPersist();
                if (granted) {
                    this.showToast("Persistent browser storage granted!", "success");
                } else {
                    this.showToast("Persistent storage request denied by browser.", "warning");
                }
                await this.renderStorageView();
            });
        }

        if (this.btnConfirmRemoveExecute) {
            this.btnConfirmRemoveExecute.addEventListener("click", async () => {
                if (this.pendingRemovalModel) {
                    await this.executeModelRemoval(this.pendingRemovalModel);
                    this.modalRemoveConfirm.classList.add("hidden");
                    this.pendingRemovalModel = null;
                }
            });
        }

        window.downloadManager.addListener((event, data) => {
            if (event === "PROGRESS") {
                this.updateDownloadProgressUI(data);
            } else if (event === "STATE_CHANGED") {
                this.renderModelStore();
                this.renderInstalledModels();
                this.renderStorageView();
                if (window.chatController) {
                    window.chatController.populateInstalledModelsDropdown().then(() => {
                        if (data.status === "INSTALLED") {
                            window.chatController.switchActiveModel(data.modelId);
                        }
                    });
                }
            } else if (event === "STORAGE_ERROR") {
                this.showToast(data.message, "error");
            }
        });
    }

    switchView(viewName) {
        this.currentView = viewName;

        this.navItems.forEach(item => {
            if (item.dataset.view === viewName) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        this.viewPanels.forEach(panel => {
            if (panel.id === `view-${viewName}`) {
                panel.classList.add("active");
            } else {
                panel.classList.remove("active");
            }
        });

        if (viewName === "store") this.renderModelStore();
        if (viewName === "installed") this.renderInstalledModels();
        if (viewName === "storage") this.renderStorageView();
    }

    async renderModelStore() {
        if (!this.storeGrid) return;
        this.storeGrid.innerHTML = "";

        const allDBModels = await window.dbInstance.getAll("models");

        for (const model of window.MODEL_REGISTRY) {
            if (this.activeCategory !== "all" && !model.category.includes(this.activeCategory)) {
                continue;
            }

            if (this.searchQuery) {
                const matchName = model.name.toLowerCase().includes(this.searchQuery);
                const matchProv = model.provider.toLowerCase().includes(this.searchQuery);
                const matchDesc = model.description.toLowerCase().includes(this.searchQuery);
                if (!matchName && !matchProv && !matchDesc) continue;
            }

            const dbRecord = allDBModels.find(m => m.id === model.id);
            const status = dbRecord ? dbRecord.status : "NOT_INSTALLED";

            const card = document.createElement("div");
            card.className = "model-card";

            const categoryTagsHtml = model.category.map(cat => `<span class="tag">${cat}</span>`).join("");
            const deviceTag = `<span class="tag tag-device">${model.device.toUpperCase()}</span>`;

            let actionButtonHtml = "";
            if (status === "INSTALLED") {
                actionButtonHtml = `
                    <button class="btn btn-primary btn-use-model" data-id="${model.id}">Use Model</button>
                    <button class="btn btn-danger btn-remove-model" data-id="${model.id}">Remove</button>
                `;
            } else if (status === "DOWNLOADING") {
                actionButtonHtml = `
                    <button class="btn btn-outline btn-cancel-download" data-id="${model.id}">Downloading... ✖</button>
                `;
            } else if (status === "QUEUED") {
                actionButtonHtml = `
                    <button class="btn btn-outline btn-cancel-download" data-id="${model.id}">Queued ✖</button>
                `;
            } else {
                actionButtonHtml = `
                    <button class="btn btn-primary btn-download-model" data-id="${model.id}">Download (${model.sizeFormatted})</button>
                `;
            }

            card.innerHTML = `
                <div>
                    <div class="model-card-header">
                        <span class="model-card-title">${model.name}</span>
                        <span class="model-provider">${model.provider}</span>
                    </div>
                    <p class="model-card-desc">${model.description}</p>
                    <div class="model-meta-tags">
                        ${deviceTag}
                        ${categoryTagsHtml}
                    </div>
                </div>

                <div class="card-download-progress ${status === 'DOWNLOADING' ? '' : 'hidden'}" id="progress-container-${model.id}">
                    <div class="progress-bar-bg margin-top-sm">
                        <div class="progress-bar-fill" id="progress-fill-${model.id}" style="width: 0%;"></div>
                    </div>
                    <div class="progress-stats-text margin-top-sm" style="display:flex; justify-content:space-between; font-size:11px; font-family:var(--font-mono); color:var(--text-secondary);">
                        <span id="progress-percent-${model.id}">0%</span>
                        <span id="progress-speed-${model.id}">0 MB/s</span>
                    </div>
                </div>

                <div class="model-card-footer">
                    <span style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);">${model.sizeFormatted}</span>
                    <div style="display:flex; gap:8px;">${actionButtonHtml}</div>
                </div>
            `;

            card.addEventListener("click", (e) => {
                const downloadBtn = e.target.closest(".btn-download-model");
                const useBtn = e.target.closest(".btn-use-model");
                const removeBtn = e.target.closest(".btn-remove-model");
                const cancelBtn = e.target.closest(".btn-cancel-download");

                if (downloadBtn) {
                    e.stopPropagation();
                    this.showToast(`Starting download for ${model.name}...`, "info");
                    window.downloadManager.startDownload(model).catch(err => {
                        this.showToast(`Download failed: ${err.message}`, "error");
                    });
                } else if (useBtn) {
                    e.stopPropagation();
                    this.switchView("chat");
                    window.chatController.switchActiveModel(model.id);
                } else if (removeBtn) {
                    e.stopPropagation();
                    this.openRemoveConfirmModal(model);
                } else if (cancelBtn) {
                    e.stopPropagation();
                    window.downloadManager.cancelDownload(model.id);
                } else {
                    this.openModelDetailModal(model);
                }
            });

            this.storeGrid.appendChild(card);
        }
    }

    async renderInstalledModels() {
        if (!this.installedGrid) return;
        this.installedGrid.innerHTML = "";

        const allDBModels = await window.dbInstance.getAll("models");
        const installedRecords = allDBModels.filter(m => m.status === "INSTALLED");

        if (installedRecords.length === 0) {
            this.installedGrid.innerHTML = `<p class="text-secondary">No models currently installed. Browse the Model Store to download models offline.</p>`;
            return;
        }

        for (const record of installedRecords) {
            const regModel = window.MODEL_REGISTRY.find(m => m.id === record.id);
            if (!regModel) continue;

            const card = document.createElement("div");
            card.className = "model-card";
            card.innerHTML = `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="model-card-title">${regModel.name}</span>
                        <span class="text-green" style="font-size:12px; font-weight:600;">● Installed</span>
                    </div>
                    <p class="model-card-desc">${regModel.description}</p>
                </div>
                <div class="model-card-footer">
                    <span style="font-size:12px; font-family:var(--font-mono); color:var(--text-muted);">${regModel.sizeFormatted}</span>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary btn-use-model" data-id="${regModel.id}">Use Model</button>
                        <button class="btn btn-danger btn-remove-model" data-id="${regModel.id}">Remove</button>
                    </div>
                </div>
            `;

            card.addEventListener("click", (e) => {
                const useBtn = e.target.closest(".btn-use-model");
                const removeBtn = e.target.closest(".btn-remove-model");
                if (useBtn) {
                    this.switchView("chat");
                    window.chatController.switchActiveModel(regModel.id);
                } else if (removeBtn) {
                    this.openRemoveConfirmModal(regModel);
                }
            });

            this.installedGrid.appendChild(card);
        }
    }

    async renderStorageView() {
        const { usage, quota, available } = await window.storageManager.getEstimate();
        const persisted = await window.storageManager.isPersisted();

        if (this.storageUsedVal) this.storageUsedVal.textContent = window.storageManager.formatBytes(usage);
        if (this.storageAvailVal) this.storageAvailVal.textContent = window.storageManager.formatBytes(available);
        if (this.storagePersistVal) {
            this.storagePersistVal.textContent = persisted ? "Granted (Persistent)" : "Temporary";
        }

        const percentUsed = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
        if (this.storageBarFill) this.storageBarFill.style.width = `${percentUsed}%`;

        if (this.storageTableBody) {
            this.storageTableBody.innerHTML = "";
            const allModels = await window.dbInstance.getAll("models");
            const installedModels = allModels.filter(m => m.status === "INSTALLED");

            if (installedModels.length === 0) {
                this.storageTableBody.innerHTML = `<tr><td colspan="5" class="text-secondary">No installed models in storage.</td></tr>`;
                return;
            }

            for (const record of installedModels) {
                const regModel = window.MODEL_REGISTRY.find(m => m.id === record.id);
                const name = regModel ? regModel.name : record.id;
                const provider = regModel ? regModel.provider : "Offline Neural Engine";
                const size = regModel ? regModel.sizeFormatted : window.storageManager.formatBytes(record.totalSize);

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${name}</strong></td>
                    <td>${provider}</td>
                    <td>${size}</td>
                    <td><span class="text-green">Installed</span></td>
                    <td>
                        <button class="btn btn-danger" onclick="window.uiManager.openRemoveConfirmModal(window.MODEL_REGISTRY.find(m => m.id === '${record.id}'))">Remove</button>
                    </td>
                `;
                this.storageTableBody.appendChild(tr);
            }
        }
    }

    updateDownloadProgressUI(data) {
        const container = document.getElementById(`progress-container-${data.modelId}`);
        const fill = document.getElementById(`progress-fill-${data.modelId}`);
        const percentText = document.getElementById(`progress-percent-${data.modelId}`);
        const speedText = document.getElementById(`progress-speed-${data.modelId}`);

        if (container) container.classList.remove("hidden");
        if (fill) fill.style.width = `${data.percent}%`;
        if (percentText) percentText.textContent = `${data.percent}%`;
        if (speedText) speedText.textContent = `${window.downloadManager.formatSpeed(data.speedBytesPerSec)} • ETA ${window.downloadManager.formatETA(data.etaSeconds)}`;
    }

    openDiagnosticsModal() {
        this.modalDiagnostics.classList.remove("hidden");

        const webgpuStatus = document.getElementById("diag-webgpu-status");
        const activeModelText = document.getElementById("diag-active-model");
        const networkStatus = document.getElementById("diag-network-status");
        const swStatus = document.getElementById("diag-sw-status");

        if (webgpuStatus) {
            webgpuStatus.textContent = window.aiEngine.device === "webgpu" ? "Active (WebGPU Accelerated)" : "Fallback (Multi-Threaded WASM SIMD)";
        }
        if (activeModelText) {
            activeModelText.textContent = window.aiEngine.activeModel ? window.aiEngine.activeModel.name : "None Loaded";
        }
        if (networkStatus) {
            networkStatus.textContent = navigator.onLine ? "Online" : "Offline (Local Engine Active)";
        }
        if (swStatus) {
            swStatus.textContent = navigator.serviceWorker && navigator.serviceWorker.controller ? "Active (App Shell Cached)" : "Inactive";
        }
    }

    openRemoveConfirmModal(model) {
        if (!model) return;
        this.pendingRemovalModel = model;

        const title = document.getElementById("remove-modal-title");
        const sizeText = document.getElementById("remove-modal-size");

        if (title) title.textContent = `Remove ${model.name}?`;
        if (sizeText) sizeText.textContent = model.sizeFormatted;

        this.modalRemoveConfirm.classList.remove("hidden");
    }

    async executeModelRemoval(model) {
        this.showToast(`Removing ${model.name}...`, "info");

        if (window.aiEngine.activeModel && window.aiEngine.activeModel.id === model.id) {
            await window.aiEngine.unloadActiveModel();
        }

        await window.storageManager.removeModelResources(model.id, model.modelId);
        await window.dbInstance.delete("downloads", model.id);
        await window.dbInstance.put("models", {
            id: model.id,
            version: model.version,
            status: "NOT_INSTALLED",
            installedAt: null,
            totalSize: 0,
            downloadedSize: 0,
            runtime: model.runtime
        });

        this.showToast(`${model.name} removed. Storage freed.`, "success");

        this.renderModelStore();
        this.renderInstalledModels();
        this.renderStorageView();
        if (window.chatController) {
            window.chatController.populateInstalledModelsDropdown();
        }
    }

    openModelDetailModal(model) {
        const title = document.getElementById("detail-model-title");
        const body = document.getElementById("detail-model-body");
        const footer = document.getElementById("detail-model-footer");

        if (title) title.textContent = model.name;

        if (body) {
            body.innerHTML = `
                <p><strong>Provider:</strong> ${model.provider}</p>
                <p><strong>Size:</strong> ${model.sizeFormatted}</p>
                <p><strong>Task:</strong> ${model.task}</p>
                <p><strong>Runtime:</strong> WebGPU / WASM (${model.dtype} quantized)</p>
                <p><strong>Context Window:</strong> ${model.contextWindow} tokens</p>
                <p class="margin-top-sm"><strong>Execution Mode:</strong> 100% In-Browser Local Compute</p>
            `;
        }

        if (footer) {
            footer.innerHTML = `
                <button class="btn btn-outline modal-close" data-modal="modal-model-detail">Close</button>
                <button class="btn btn-primary btn-detail-download">Download (${model.sizeFormatted})</button>
            `;
            const btnDl = footer.querySelector(".btn-detail-download");
            if (btnDl) {
                btnDl.onclick = () => {
                    this.modalModelDetail.classList.add("hidden");
                    window.downloadManager.startDownload(model).catch(err => this.showToast(err.message, "error"));
                };
            }
        }

        this.modalModelDetail.classList.remove("hidden");
    }

    updateSystemStatus() {
        const sidebarStatusText = document.getElementById("sidebar-status-text");
        const gpuBadge = document.getElementById("system-gpu-badge");

        const activeModel = window.aiEngine.activeModel;
        const device = window.aiEngine.device.toUpperCase();

        if (gpuBadge) gpuBadge.textContent = device;

        if (activeModel) {
            if (sidebarStatusText) sidebarStatusText.textContent = `${activeModel.name} (${device})`;
        } else {
            if (sidebarStatusText) sidebarStatusText.textContent = `${device} Ready`;
        }
    }

    showToast(message, type = "info") {
        if (!this.toastContainer) return;

        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 250);
        }, 3500);
    }
}

window.uiManager = new UIManager();
