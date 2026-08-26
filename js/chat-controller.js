class ChatController {
    constructor() {
        this.currentConversationId = null;
        this.messages = [];
        this.systemPrompt = window.KNI_CONFIG.DEFAULT_SYSTEM_PROMPT;
        this.renderAnimationFrame = null;
        
        this.isRecording = false;
        this.recognition = null;
        this.voiceBaseText = "";

        this.isVoiceModeActive = false;
        this.voiceModeRecognition = null;
        this.synth = window.speechSynthesis;

        this.genSettings = {
            temperature: 0.7,
            top_p: 0.9,
            max_new_tokens: 512,
            repetition_penalty: 1.1,
            system_prompt: window.KNI_CONFIG.DEFAULT_SYSTEM_PROMPT
        };

        this.loadSettingsFromStorage();
        this.initDOMReferences();
        this.bindEvents();
        this.initVoiceRecognition();
        this.initVoiceMode();
        this.initSettingsModal();
    }

    loadSettingsFromStorage() {
        try {
            const saved = localStorage.getItem("offline_ai_gen_settings");
            if (saved) {
                const parsed = JSON.parse(saved);
                this.genSettings = { ...this.genSettings, ...parsed };
                this.systemPrompt = this.genSettings.system_prompt || window.KNI_CONFIG.DEFAULT_SYSTEM_PROMPT;
            }
        } catch (e) {}
    }

    saveSettingsToStorage() {
        try {
            localStorage.setItem("offline_ai_gen_settings", JSON.stringify(this.genSettings));
        } catch (e) {}
    }

    initDOMReferences() {
        this.messagesWrapper = document.getElementById("messages-wrapper");
        this.messagesList = document.getElementById("messages-list");
        this.welcomeHero = document.getElementById("chat-welcome-hero");
        this.chatInput = document.getElementById("chat-input");
        this.btnSendMsg = document.getElementById("btn-send-msg");
        this.btnStopGen = document.getElementById("btn-stop-generation");
        this.btnNewChat = document.getElementById("btn-new-chat");
        this.recentList = document.getElementById("recent-conversations-list");
        this.btnMicDictation = document.getElementById("btn-mic-dictation");

        this.customModelTriggerBtn = document.getElementById("custom-model-trigger-btn");
        this.triggerSelectedModelName = document.getElementById("trigger-selected-model-name");
        this.customModelDropdownMenu = document.getElementById("custom-model-dropdown-menu");
        this.customModelOptionsList = document.getElementById("custom-model-options-list");
        this.btnDropdownOpenStore = document.getElementById("btn-dropdown-open-store");

        this.modelMissingBanner = document.getElementById("model-missing-banner");
        this.bannerMessage = document.getElementById("banner-message");
        this.btnBannerAction = document.getElementById("btn-banner-action");
        this.speedCounter = document.getElementById("inference-speed-counter");

        this.btnVoiceModeToggle = document.getElementById("btn-voice-mode-toggle");
        this.modalVoiceMode = document.getElementById("modal-voice-mode");
        this.btnVoiceEndSession = document.getElementById("btn-voice-end-session");
        this.btnVoiceOrbMic = document.getElementById("btn-voice-orb-mic");
        this.voiceAiOrb = document.getElementById("voice-ai-orb");
        this.voiceStatusTitle = document.getElementById("voice-status-title");
        this.voiceTranscriptText = document.getElementById("voice-transcript-text");

        this.btnOpenSettings = document.getElementById("btn-open-settings");
        this.modalGenSettings = document.getElementById("modal-generation-settings");
        this.inputTemp = document.getElementById("setting-temperature");
        this.inputTopP = document.getElementById("setting-top-p");
        this.inputMaxTokens = document.getElementById("setting-max-tokens");
        this.inputRepPen = document.getElementById("setting-repetition-penalty");
        this.inputSysPrompt = document.getElementById("setting-system-prompt");

        this.valTemp = document.getElementById("val-temperature");
        this.valTopP = document.getElementById("val-top-p");
        this.valMaxTokens = document.getElementById("val-max-tokens");
        this.valRepPen = document.getElementById("val-repetition-penalty");

        this.btnSaveSettings = document.getElementById("btn-save-settings");
        this.btnResetSettings = document.getElementById("btn-reset-settings");

        this.selectedModelId = null;
    }

    bindEvents() {
        if (this.customModelTriggerBtn) {
            this.customModelTriggerBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleCustomModelMenu();
            });
        }

        document.addEventListener("click", (e) => {
            if (this.customModelDropdownMenu && !this.customModelDropdownMenu.classList.contains("hidden")) {
                if (!e.target.closest(".custom-model-selector-wrapper")) {
                    this.closeCustomModelMenu();
                }
            }
        });

        if (this.btnDropdownOpenStore) {
            this.btnDropdownOpenStore.addEventListener("click", () => {
                this.closeCustomModelMenu();
                if (window.uiManager) {
                    window.uiManager.switchView("store");
                }
            });
        }

        if (this.btnSendMsg) {
            this.btnSendMsg.addEventListener("click", () => {
                this.handleSendMessage();
            });
        }

        if (this.btnNewChat) {
            this.btnNewChat.addEventListener("click", () => {
                this.createNewConversation();
            });
        }

        if (this.chatInput) {
            this.chatInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
            this.chatInput.addEventListener("input", () => {
                this.chatInput.style.height = "auto";
                this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 160) + "px";
                this.updateSendButtonState();
            });
        }

        if (this.btnStopGen) {
            this.btnStopGen.addEventListener("click", () => {
                window.aiEngine.stopGeneration();
                this.btnSendMsg.classList.remove("hidden");
                this.btnStopGen.classList.add("hidden");
                this.updateSendButtonState();
            });
        }

        const quickPrompts = document.getElementById("quick-prompts");
        if (quickPrompts) {
            quickPrompts.addEventListener("click", (e) => {
                const chip = e.target.closest(".chip-card");
                if (chip) {
                    const promptText = chip.dataset.prompt;
                    this.chatInput.value = promptText;
                    this.updateSendButtonState();
                    this.handleSendMessage();
                }
            });
        }

        if (this.btnBannerAction) {
            this.btnBannerAction.addEventListener("click", () => {
                if (window.uiManager) {
                    window.uiManager.switchView("store");
                }
            });
        }
    }

    initSettingsModal() {
        if (this.btnOpenSettings) {
            this.btnOpenSettings.addEventListener("click", () => {
                this.syncSettingsToInputs();
                if (this.modalGenSettings) this.modalGenSettings.classList.remove("hidden");
            });
        }

        const updateBadges = () => {
            if (this.valTemp && this.inputTemp) this.valTemp.textContent = this.inputTemp.value;
            if (this.valTopP && this.inputTopP) this.valTopP.textContent = this.inputTopP.value;
            if (this.valMaxTokens && this.inputMaxTokens) this.valMaxTokens.textContent = this.inputMaxTokens.value;
            if (this.valRepPen && this.inputRepPen) this.valRepPen.textContent = this.inputRepPen.value;
        };

        [this.inputTemp, this.inputTopP, this.inputMaxTokens, this.inputRepPen].forEach(input => {
            if (input) input.addEventListener("input", updateBadges);
        });

        if (this.btnSaveSettings) {
            this.btnSaveSettings.addEventListener("click", () => {
                this.genSettings.temperature = parseFloat(this.inputTemp.value);
                this.genSettings.top_p = parseFloat(this.inputTopP.value);
                this.genSettings.max_new_tokens = parseInt(this.inputMaxTokens.value, 10);
                this.genSettings.repetition_penalty = parseFloat(this.inputRepPen.value);
                this.genSettings.system_prompt = this.inputSysPrompt.value.trim() || window.KNI_CONFIG.DEFAULT_SYSTEM_PROMPT;

                this.systemPrompt = this.genSettings.system_prompt;
                this.saveSettingsToStorage();

                if (this.modalGenSettings) this.modalGenSettings.classList.add("hidden");
                if (window.uiManager) window.uiManager.showToast("Model generation settings saved!", "success");
            });
        }

        if (this.btnResetSettings) {
            this.btnResetSettings.addEventListener("click", () => {
                this.genSettings = {
                    temperature: 0.7,
                    top_p: 0.9,
                    max_new_tokens: 512,
                    repetition_penalty: 1.1,
                    system_prompt: window.KNI_CONFIG.DEFAULT_SYSTEM_PROMPT
                };
                this.systemPrompt = this.genSettings.system_prompt;
                this.saveSettingsToStorage();
                this.syncSettingsToInputs();
                if (window.uiManager) window.uiManager.showToast("Settings reset to defaults.", "info");
            });
        }
    }

    syncSettingsToInputs() {
        if (this.inputTemp) this.inputTemp.value = this.genSettings.temperature;
        if (this.inputTopP) this.inputTopP.value = this.genSettings.top_p;
        if (this.inputMaxTokens) this.inputMaxTokens.value = this.genSettings.max_new_tokens;
        if (this.inputRepPen) this.inputRepPen.value = this.genSettings.repetition_penalty;
        if (this.inputSysPrompt) this.inputSysPrompt.value = this.genSettings.system_prompt;

        if (this.valTemp) this.valTemp.textContent = this.genSettings.temperature;
        if (this.valTopP) this.valTopP.textContent = this.genSettings.top_p;
        if (this.valMaxTokens) this.valMaxTokens.textContent = this.genSettings.max_new_tokens;
        if (this.valRepPen) this.valRepPen.textContent = this.genSettings.repetition_penalty;
    }

    initVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (this.btnMicDictation) {
                this.btnMicDictation.addEventListener("click", () => {
                    if (window.uiManager) {
                        window.uiManager.showToast("Voice speech recognition is not supported in this browser.", "warning");
                    }
                });
            }
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isRecording = true;
            this.voiceBaseText = this.chatInput.value.trim();
            if (this.voiceBaseText.length > 0) {
                this.voiceBaseText += " ";
            }
            if (this.btnMicDictation) this.btnMicDictation.classList.add("recording");
            if (window.uiManager) {
                window.uiManager.showToast("Listening continuous voice...", "info");
            }
        };

        this.recognition.onresult = (e) => {
            let sessionTranscript = "";
            for (let i = 0; i < e.results.length; ++i) {
                sessionTranscript += e.results[i][0].transcript;
            }

            this.chatInput.value = this.voiceBaseText + sessionTranscript;
            this.chatInput.style.height = "auto";
            this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 160) + "px";
            this.updateSendButtonState();
        };

        this.recognition.onerror = (e) => {
            if (e.error !== 'no-speech') {
                this.stopVoiceRecognition();
                if (window.uiManager) {
                    window.uiManager.showToast(`Voice mic notice: ${e.error}`, "warning");
                }
            }
        };

        this.recognition.onend = () => {
            this.stopVoiceRecognition();
        };

        if (this.btnMicDictation) {
            this.btnMicDictation.addEventListener("click", () => {
                if (this.isRecording) {
                    if (this.recognition) this.recognition.stop();
                    this.stopVoiceRecognition();
                } else {
                    try {
                        this.recognition.start();
                    } catch (err) {
                        this.stopVoiceRecognition();
                    }
                }
            });
        }
    }

    stopVoiceRecognition() {
        this.isRecording = false;
        if (this.btnMicDictation) this.btnMicDictation.classList.remove("recording");
    }

    /* REAL-TIME VOICE-TO-VOICE AI CHAT MODE */
    initVoiceMode() {
        if (this.btnVoiceModeToggle) {
            this.btnVoiceModeToggle.addEventListener("click", () => {
                this.openVoiceMode();
            });
        }

        if (this.btnVoiceEndSession) {
            this.btnVoiceEndSession.addEventListener("click", () => {
                this.closeVoiceMode();
            });
        }
    }

    openVoiceMode() {
        if (!this.selectedModelId) {
            if (window.uiManager) window.uiManager.showToast("Please install and select an AI model first.", "warning");
            return;
        }

        this.isVoiceModeActive = true;
        this.modalVoiceMode.classList.remove("hidden");
        this.startVoiceModeListening();
    }

    closeVoiceMode() {
        this.isVoiceModeActive = false;
        if (this.modalVoiceMode) this.modalVoiceMode.classList.add("hidden");
        if (this.synth) this.synth.cancel();
        if (this.voiceModeRecognition) {
            try { this.voiceModeRecognition.stop(); } catch(e){}
        }
    }

    setVoiceOrbState(state, title, detail) {
        if (!this.voiceAiOrb) return;
        this.voiceAiOrb.className = `voice-orb ${state}`;
        if (this.voiceStatusTitle && title) this.voiceStatusTitle.textContent = title;
        if (this.voiceTranscriptText && detail) this.voiceTranscriptText.textContent = detail;
    }

    startVoiceModeListening() {
        if (!this.isVoiceModeActive) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.setVoiceOrbState("", "Not Supported", "Browser Speech API not supported.");
            return;
        }

        this.setVoiceOrbState("listening", "Listening...", "Speak your prompt naturally");

        this.voiceModeRecognition = new SpeechRecognition();
        this.voiceModeRecognition.continuous = false;
        this.voiceModeRecognition.interimResults = true;
        this.voiceModeRecognition.lang = 'en-US';

        let capturedText = "";

        this.voiceModeRecognition.onresult = (e) => {
            capturedText = Array.from(e.results).map(r => r[0].transcript).join("");
            if (this.voiceTranscriptText) this.voiceTranscriptText.textContent = `"${capturedText}"`;
        };

        this.voiceModeRecognition.onend = async () => {
            if (!this.isVoiceModeActive) return;
            if (capturedText.trim().length > 0) {
                await this.processVoiceModeTurn(capturedText.trim());
            } else {
                setTimeout(() => {
                    if (this.isVoiceModeActive) this.startVoiceModeListening();
                }, 500);
            }
        };

        try {
            this.voiceModeRecognition.start();
        } catch(e) {}
    }

    async processVoiceModeTurn(userSpeech) {
        if (!this.isVoiceModeActive) return;

        this.setVoiceOrbState("thinking", "Thinking...", `"${userSpeech}"`);

        const userMsg = {
            id: "msg_" + Date.now(),
            conversationId: this.currentConversationId,
            role: "user",
            content: userSpeech,
            timestamp: Date.now()
        };

        this.messages.push(userMsg);
        await window.dbInstance.put("messages", userMsg);

        const assistantMsg = {
            id: "msg_" + (Date.now() + 1),
            conversationId: this.currentConversationId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            modelId: window.aiEngine.activeModel ? window.aiEngine.activeModel.id : "local"
        };

        this.messages.push(assistantMsg);
        this.renderMessages();

        let aiFullResponse = "";

        await window.aiEngine.generateResponse(
            this.messages.filter(m => m.role !== "assistant" || m.content.length > 0),
            this.systemPrompt,
            (tokenData) => {
                aiFullResponse = tokenData.fullText;
                assistantMsg.content = tokenData.fullText;
                if (this.voiceTranscriptText) this.voiceTranscriptText.textContent = tokenData.fullText.substring(0, 80) + "...";
            },
            async (finalData) => {
                if (finalData.stopped) {
                    if (!assistantMsg.content) {
                        this.messages = this.messages.filter(m => m.id !== assistantMsg.id);
                        await window.dbInstance.delete("messages", assistantMsg.id);
                    } else {
                        await window.dbInstance.put("messages", assistantMsg);
                    }
                } else {
                    aiFullResponse = finalData.text;
                    assistantMsg.content = finalData.text;
                    await window.dbInstance.put("messages", finalData.assistantMsg || assistantMsg);
                }
                this.renderMessages();

                if (this.isVoiceModeActive && aiFullResponse) {
                    this.speakVoiceModeResponse(aiFullResponse);
                }
            },
            (err) => {
                if (this.isVoiceModeActive) this.startVoiceModeListening();
            },
            this.genSettings
        );
    }

    speakVoiceModeResponse(text) {
        if (!this.isVoiceModeActive) return;

        const cleanText = text.replace(/```[\s\S]*?```/g, "Code block omitted.")
                              .replace(/[#*`_~]/g, "")
                              .trim();

        if (!this.synth || !cleanText) {
            this.startVoiceModeListening();
            return;
        }

        this.synth.cancel();
        this.setVoiceOrbState("speaking", "LWM Speaking...", cleanText.substring(0, 100) + "...");

        const utterance = new SpeechSynthesisUtterance(cleanText.substring(0, 300));
        utterance.rate = 1.0;

        utterance.onend = () => {
            if (this.isVoiceModeActive) {
                setTimeout(() => this.startVoiceModeListening(), 400);
            }
        };

        utterance.onerror = () => {
            if (this.isVoiceModeActive) {
                this.startVoiceModeListening();
            }
        };

        this.synth.speak(utterance);
    }

    updateSendButtonState() {
        if (!this.btnSendMsg || !this.chatInput) return;
        const hasText = this.chatInput.value.trim().length > 0;
        if (hasText) {
            this.btnSendMsg.classList.remove("disabled");
            this.btnSendMsg.disabled = false;
        } else {
            this.btnSendMsg.classList.add("disabled");
            this.btnSendMsg.disabled = true;
        }
    }

    toggleCustomModelMenu() {
        if (!this.customModelDropdownMenu) return;
        const isHidden = this.customModelDropdownMenu.classList.contains("hidden");
        if (isHidden) {
            this.customModelDropdownMenu.classList.remove("hidden");
            if (this.customModelTriggerBtn) this.customModelTriggerBtn.classList.add("open");
        } else {
            this.closeCustomModelMenu();
        }
    }

    closeCustomModelMenu() {
        if (this.customModelDropdownMenu) {
            this.customModelDropdownMenu.classList.add("hidden");
        }
        if (this.customModelTriggerBtn) {
            this.customModelTriggerBtn.classList.remove("open");
        }
    }

    async init() {
        await this.populateInstalledModelsDropdown();
        
        const conversations = await window.dbInstance.getAll("conversations");
        conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (conversations.length > 0) {
            await this.switchConversation(conversations[0].id);
        } else {
            await this.createNewConversation();
        }
        this.updateSendButtonState();
    }

    async loadRecentConversations() {
        if (!this.recentList) return;
        this.recentList.innerHTML = "";

        const conversations = await window.dbInstance.getAll("conversations");
        conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (conversations.length === 0) {
            this.recentList.innerHTML = `<div class="empty-history">No past conversations</div>`;
            return;
        }

        for (const conv of conversations) {
            const item = document.createElement("div");
            item.className = `conv-item ${conv.id === this.currentConversationId ? 'active' : ''}`;
            item.innerHTML = `
                <span>${this.escapeHTML(conv.title || "New Chat")}</span>
                <button class="conv-delete-btn" data-id="${conv.id}">&times;</button>
            `;

            item.onclick = (e) => {
                const delBtn = e.target.closest(".conv-delete-btn");
                if (delBtn) {
                    e.stopPropagation();
                    this.deleteConversation(conv.id);
                } else {
                    this.switchConversation(conv.id);
                }
            };

            this.recentList.appendChild(item);
        }
    }

    async switchConversation(convId) {
        this.currentConversationId = convId;
        const allMsgs = await window.dbInstance.getAll("messages");
        this.messages = allMsgs.filter(m => m.conversationId === convId);
        this.messages.sort((a, b) => a.timestamp - b.timestamp);

        await this.loadRecentConversations();
        this.renderMessages();
    }

    async deleteConversation(convId) {
        await window.dbInstance.delete("conversations", convId);
        const allMsgs = await window.dbInstance.getAll("messages");
        for (const msg of allMsgs) {
            if (msg.conversationId === convId) {
                await window.dbInstance.delete("messages", msg.id);
            }
        }
        
        const remaining = await window.dbInstance.getAll("conversations");
        if (remaining.length > 0) {
            remaining.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            await this.switchConversation(remaining[0].id);
        } else {
            await this.createNewConversation();
        }
    }

    async populateInstalledModelsDropdown() {
        await window.dbInstance.init();
        const allDBModels = await window.dbInstance.getAll("models");
        const installedRecords = allDBModels.filter(m => m.status === "INSTALLED");

        if (!this.customModelOptionsList) return;
        this.customModelOptionsList.innerHTML = "";

        if (installedRecords.length === 0) {
            this.triggerSelectedModelName.textContent = "No Model Installed";
            this.selectedModelId = null;

            const emptyItem = document.createElement("div");
            emptyItem.className = "dropdown-option-item";
            emptyItem.innerHTML = `
                <div class="opt-info">
                    <span class="opt-name">No Models Installed</span>
                    <span class="opt-desc">Download a model from the Store</span>
                </div>
            `;
            this.customModelOptionsList.appendChild(emptyItem);

            this.showMissingModelBanner("No AI model installed. Open the Model Store to download a model.");
            return;
        }

        this.hideMissingModelBanner();

        let lastSelectedId = null;
        let maxTime = -1;

        for (const record of installedRecords) {
            const registryModel = window.MODEL_REGISTRY.find(m => m.id === record.id);
            const name = registryModel ? registryModel.name : record.id;
            const desc = registryModel ? registryModel.sizeFormatted : "Local model";

            const usedTime = record.lastUsedAt || record.installedAt || 0;
            if (usedTime > maxTime) {
                maxTime = usedTime;
                lastSelectedId = record.id;
            }

            const item = document.createElement("div");
            item.className = `dropdown-option-item ${record.id === this.selectedModelId ? 'selected' : ''}`;
            item.innerHTML = `
                <div class="opt-info">
                    <span class="opt-name">${name}</span>
                    <span class="opt-desc">${desc} • Ready Offline</span>
                </div>
                <span class="opt-status-badge opt-status-installed">● Ready</span>
            `;

            item.onclick = async () => {
                this.closeCustomModelMenu();
                await this.switchActiveModel(record.id);
            };

            this.customModelOptionsList.appendChild(item);
        }

        if (!this.selectedModelId && lastSelectedId) {
            const targetModel = window.MODEL_REGISTRY.find(m => m.id === lastSelectedId);
            if (targetModel) {
                this.selectedModelId = lastSelectedId;
                this.triggerSelectedModelName.textContent = targetModel.name;
                if (!window.aiEngine.activeModel || window.aiEngine.activeModel.id !== lastSelectedId) {
                    await window.aiEngine.loadModel(targetModel).catch(() => {});
                }
            }
        }
    }

    async switchActiveModel(modelId) {
        const targetModel = window.MODEL_REGISTRY.find(m => m.id === modelId);
        if (!targetModel) return;

        const status = await window.modelResolver.resolveStatus(modelId);
        if (status !== "INSTALLED") {
            window.uiManager.showToast(`Model ${targetModel.name} is not installed.`, "warning");
            return;
        }

        try {
            this.chatInput.disabled = true;
            this.btnSendMsg.disabled = true;
            this.selectedModelId = modelId;
            this.triggerSelectedModelName.textContent = targetModel.name;

            window.uiManager.showToast(`Loading model ${targetModel.name}...`, "info");
            await window.aiEngine.loadModel(targetModel);
            window.uiManager.showToast(`Active model: ${targetModel.name} Ready`, "success");

            if (this.currentConversationId) {
                const conv = await window.dbInstance.get("conversations", this.currentConversationId);
                if (conv) {
                    conv.modelId = modelId;
                    conv.updatedAt = Date.now();
                    await window.dbInstance.put("conversations", conv);
                }
            }

            window.uiManager.updateSystemStatus();
            await this.populateInstalledModelsDropdown();

        } catch (err) {
            window.uiManager.showToast(`Failed to load ${targetModel.name}: ${err.message}`, "error");
        } finally {
            this.chatInput.disabled = false;
            this.updateSendButtonState();
        }
    }

    async createNewConversation() {
        const convId = "conv_" + Date.now();
        const activeModelId = this.selectedModelId || (window.MODEL_REGISTRY[0] ? window.MODEL_REGISTRY[0].id : "qwen3-4b-instruct");

        const conversation = {
            id: convId,
            title: "New Chat",
            modelId: activeModelId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await window.dbInstance.put("conversations", conversation);
        this.currentConversationId = convId;
        this.messages = [];

        await this.loadRecentConversations();
        this.renderMessages();
    }

    async handleSendMessage() {
        const userText = this.chatInput.value.trim();
        if (!userText || window.aiEngine.isGenerating) return;

        const selectedModelId = this.selectedModelId;
        const targetModel = window.MODEL_REGISTRY.find(m => m.id === selectedModelId);

        if (!targetModel) {
            window.uiManager.showToast("Please download and select an installed AI model first.", "warning");
            if (window.uiManager) {
                window.uiManager.switchView("store");
            }
            return;
        }

        const status = await window.modelResolver.resolveStatus(selectedModelId);
        if (status !== "INSTALLED") {
            window.uiManager.showToast(`Model ${targetModel.name} is not installed. Open the Model Store to download it.`, "warning");
            if (window.uiManager) {
                window.uiManager.switchView("store");
            }
            return;
        }

        if (!window.aiEngine.activeModel || window.aiEngine.activeModel.id !== selectedModelId) {
            try {
                window.uiManager.showToast(`Loading ${targetModel.name}...`, "info");
                await window.aiEngine.loadModel(targetModel);
                window.uiManager.updateSystemStatus();
            } catch (err) {
                window.uiManager.showToast(`Failed to load ${targetModel.name}: ${err.message}`, "error");
                return;
            }
        }

        this.chatInput.value = "";
        this.chatInput.style.height = "auto";
        this.updateSendButtonState();

        if (this.messages.length === 0 && this.currentConversationId) {
            const conv = await window.dbInstance.get("conversations", this.currentConversationId);
            if (conv) {
                conv.title = userText.substring(0, 24) + (userText.length > 24 ? "..." : "");
                conv.updatedAt = Date.now();
                await window.dbInstance.put("conversations", conv);
                await this.loadRecentConversations();
            }
        }

        const userMsg = {
            id: "msg_" + Date.now(),
            conversationId: this.currentConversationId,
            role: "user",
            content: userText,
            timestamp: Date.now()
        };

        this.messages.push(userMsg);
        await window.dbInstance.put("messages", userMsg);

        const assistantMsg = {
            id: "msg_" + (Date.now() + 1),
            conversationId: this.currentConversationId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            modelId: window.aiEngine.activeModel.id
        };

        this.messages.push(assistantMsg);
        this.renderMessages();

        this.btnSendMsg.classList.add("hidden");
        this.btnStopGen.classList.remove("hidden");

        await window.aiEngine.generateResponse(
            this.messages.filter(m => m.role !== "assistant" || m.content.length > 0),
            this.systemPrompt,
            (tokenData) => {
                assistantMsg.content = tokenData.fullText;
                this.speedCounter.textContent = `${tokenData.tps} t/s`;
                this.scheduleStreamRender();
            },
            async (finalData) => {
                if (finalData.stopped) {
                    if (!assistantMsg.content) {
                        this.messages = this.messages.filter(m => m.id !== assistantMsg.id);
                        await window.dbInstance.delete("messages", assistantMsg.id);
                    } else {
                        await window.dbInstance.put("messages", assistantMsg);
                    }
                } else {
                    assistantMsg.content = finalData.text;
                    await window.dbInstance.put("messages", finalData.assistantMsg || assistantMsg);
                }

                this.btnSendMsg.classList.remove("hidden");
                this.btnStopGen.classList.add("hidden");
                this.speedCounter.textContent = `${finalData.tps || 0} t/s`;
                this.updateSendButtonState();
                this.renderMessages();
            },
            (err) => {
                this.messages = this.messages.filter(m => m.id !== assistantMsg.id);
                this.btnSendMsg.classList.remove("hidden");
                this.btnStopGen.classList.add("hidden");
                this.updateSendButtonState();
                this.renderMessages();
            },
            this.genSettings
        );
    }

    scheduleStreamRender() {
        if (this.renderAnimationFrame) return;
        this.renderAnimationFrame = requestAnimationFrame(() => {
            this.renderMessages();
            this.renderAnimationFrame = null;
        });
    }

    renderMessages() {
        if (this.messages.length === 0) {
            this.welcomeHero.classList.remove("hidden");
            this.messagesList.innerHTML = "";
            return;
        }

        this.welcomeHero.classList.add("hidden");
        this.messagesList.innerHTML = "";

        for (const msg of this.messages) {
            const itemDiv = document.createElement("div");
            itemDiv.className = `message-item ${msg.role}`;

            const renderedContent = msg.role === "user" ? this.escapeHTML(msg.content) : this.renderMarkdown(msg.content);
            const metaTag = msg.role === "assistant" ? `<div class="message-meta">${msg.modelId || "local"}</div>` : "";

            itemDiv.innerHTML = `
                <div class="message-bubble">
                    <div>${renderedContent}</div>
                    ${metaTag}
                </div>
            `;

            this.messagesList.appendChild(itemDiv);
        }

        this.attachCodeCopyHandlers();
        this.messagesWrapper.scrollTop = this.messagesWrapper.scrollHeight;
    }

    renderMarkdown(text) {
        if (!text) {
            return `<div class="thinking-loader-wrapper"><span class="thinking-text">Thinking</span><span class="thinking-dots"><span class="dot d1">•</span><span class="dot d2">•</span><span class="dot d3">•</span></span></div>`;
        }

        if (window.marked) {
            try {
                let html = window.marked.parse(text);
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = html;

                tempDiv.querySelectorAll("pre code").forEach((codeBlock) => {
                    if (window.hljs) {
                        window.hljs.highlightElement(codeBlock);
                    }
                    const pre = codeBlock.parentElement;
                    const lang = codeBlock.className.replace("language-", "").replace("hljs ", "") || "code";

                    const wrapper = document.createElement("div");
                    wrapper.className = "code-wrapper";

                    const header = document.createElement("div");
                    header.className = "code-header";
                    header.innerHTML = `
                        <span>${lang}</span>
                        <button class="btn-copy-code" data-code="${encodeURIComponent(codeBlock.textContent)}">Copy code</button>
                    `;

                    pre.parentNode.insertBefore(wrapper, pre);
                    wrapper.appendChild(header);
                    wrapper.appendChild(pre);
                });

                return tempDiv.innerHTML;
            } catch (e) {}
        }
        return this.escapeHTML(text);
    }

    attachCodeCopyHandlers() {
        document.querySelectorAll(".btn-copy-code").forEach((btn) => {
            btn.onclick = (e) => {
                const codeText = decodeURIComponent(btn.dataset.code);
                navigator.clipboard.writeText(codeText).then(() => {
                    btn.textContent = "Copied!";
                    setTimeout(() => { btn.textContent = "Copy code"; }, 2000);
                });
            };
        });
    }

    showMissingModelBanner(message) {
        this.bannerMessage.textContent = message;
        this.modelMissingBanner.classList.remove("hidden");
    }

    hideMissingModelBanner() {
        this.modelMissingBanner.classList.add("hidden");
    }

    escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
}

window.chatController = new ChatController();
