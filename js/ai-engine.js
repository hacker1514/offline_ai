class CustomInterruptableStoppingCriteria {
    constructor() {
        this.interrupted = false;
    }
    interrupt() {
        this.interrupted = true;
    }
    reset() {
        this.interrupted = false;
    }
    _call(input_ids, scores) {
        return this.interrupted;
    }
    call(input_ids, scores) {
        return this.interrupted;
    }
}

class AIEngine {
    constructor() {
        this.activePipeline = null;
        this.activeModel = null;
        this.device = "wasm";
        this.isGenerating = false;
        this.abortRequested = false;
        this.stoppingCriteria = null;
    }

    async detectHardware() {
        if (navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    this.device = "webgpu";
                    return "webgpu";
                }
            } catch (e) {}
        }
        this.device = "wasm";
        return "wasm";
    }

    async loadModel(model, onProgress = null) {
        if (this.activeModel && this.activeModel.id === model.id && this.activePipeline) {
            return { ok: true, device: this.device, model };
        }

        await this.unloadActiveModel();

        if (!window.TransformersJS || !window.TransformersJS.pipeline) {
            throw new Error("Transformers.js engine bundle is not loaded.");
        }

        const status = await window.modelResolver.resolveStatus(model.id);
        const isInstalled = status === "INSTALLED";

        window.modelResolver.setupTransformersEnv(isInstalled);

        const pipelineFunc = window.TransformersJS.pipeline;
        const targetDtype = model.dtype || "q4";

        const attemptLoad = async (deviceType, dtypeVal) => {
            const options = {
                device: deviceType,
                dtype: dtypeVal,
                local_files_only: isInstalled,
                progress_callback: (progressInfo) => {
                    if (onProgress) onProgress(progressInfo);
                }
            };
            return await pipelineFunc(model.task || "text-generation", model.modelId, options);
        };

        const persistInstalledState = async () => {
            if (window.dbInstance) {
                await window.dbInstance.put("models", {
                    id: model.id,
                    version: model.version,
                    status: "INSTALLED",
                    installedAt: Date.now(),
                    totalSize: model.sizeBytes,
                    downloadedSize: model.sizeBytes,
                    runtime: model.runtime,
                    lastUsedAt: Date.now()
                }).catch(() => {});

                await window.dbInstance.put("downloads", {
                    id: model.id,
                    modelId: model.id,
                    modelName: model.name,
                    status: "INSTALLED",
                    downloadedBytes: model.sizeBytes,
                    totalBytes: model.sizeBytes,
                    updatedAt: Date.now()
                }).catch(() => {});
            }
            if (window.uiManager) {
                window.uiManager.updateSystemStatus();
            }
        };

        try {
            console.log(`[AI Engine] Loading ${model.name} on ${this.device}...`);
            if (window.uiManager) {
                window.uiManager.showToast("Loading model...", "info");
            }
            this.activePipeline = await attemptLoad(this.device, targetDtype);
            this.activeModel = model;
            await persistInstalledState();
            return { ok: true, device: this.device, model };
        } catch (err1) {
            console.warn(`[AI Engine] ${this.device} load failed (${err1.message}). Falling back to WASM...`);
            if (window.uiManager) {
                window.uiManager.showToast("Loading model on CPU...", "warning");
            }
            try {
                this.device = "wasm";
                this.activePipeline = await attemptLoad("wasm", targetDtype);
                this.activeModel = model;
                await persistInstalledState();
                return { ok: true, device: "wasm", model };
            } catch (err2) {
                console.error(`[AI Engine] WASM fallback failed for ${model.name}:`, err2);
                throw new Error(`Could not load model: ${err2.message || err1.message}`);
            }
        }
    }

    async unloadActiveModel() {
        if (this.activePipeline) {
            if (typeof this.activePipeline.dispose === "function") {
                try {
                    await this.activePipeline.dispose();
                } catch (e) {}
            }

            this.activePipeline = null;
            this.activeModel = null;
        }
    }

    sanitizeOutput(rawOutput, formattedPrompt) {
        if (!rawOutput) return "";
        let text = "";

        if (typeof rawOutput === "string") {
            text = rawOutput;
        } else if (Array.isArray(rawOutput)) {
            if (typeof rawOutput[0] === "string") {
                text = rawOutput[0];
            } else if (rawOutput[0] && typeof rawOutput[0].generated_text === "string") {
                text = rawOutput[0].generated_text;
            } else if (rawOutput[0] && Array.isArray(rawOutput[0].generated_text)) {
                const msgs = rawOutput[0].generated_text;
                const lastMsg = msgs[msgs.length - 1];
                text = lastMsg ? (lastMsg.content || "") : "";
            }
        } else if (typeof rawOutput === "object" && rawOutput.generated_text) {
            text = typeof rawOutput.generated_text === "string" ? rawOutput.generated_text : JSON.stringify(rawOutput.generated_text);
        }

        if (!text) return "";

        let clean = text;
        const lowerClean = clean.toLowerCase();
        const assistantMarkers = ["assistant\n", "assistant:", "assistant"];

        for (const marker of assistantMarkers) {
            const lastIdx = lowerClean.lastIndexOf(marker);
            if (lastIdx !== -1) {
                clean = clean.substring(lastIdx + marker.length);
                break;
            }
        }

        const chatMLStops = ["<|im_end|>", "<end_of_turn>", "<|im_start|>"];
        for (const stop of chatMLStops) {
            const idx = clean.indexOf(stop);
            if (idx !== -1) {
                clean = clean.substring(0, idx);
            }
        }

        const userContinuationRegex = /\n(User|USER|System|SYSTEM)\s*:/i;
        const match = userContinuationRegex.exec(clean);
        if (match) {
            clean = clean.substring(0, match.index);
        }

        return clean.trim();
    }

    async generateResponse(messages, systemPrompt, onToken, onComplete, onError, customParams = {}) {
        if (!this.activePipeline || !this.activeModel) {
            throw new Error("No model is currently loaded in memory.");
        }

        this.isGenerating = true;
        this.abortRequested = false;

        const formattedPrompt = window.modelAdapter.formatPrompt(this.activeModel, messages, systemPrompt);

        let tokenCount = 0;
        const startTime = Date.now();

        const InterruptableClass = (window.TransformersJS && window.TransformersJS.InterruptableStoppingCriteria)
            ? window.TransformersJS.InterruptableStoppingCriteria
            : CustomInterruptableStoppingCriteria;

        this.stoppingCriteria = new InterruptableClass();
        if (typeof this.stoppingCriteria.reset === "function") {
            this.stoppingCriteria.reset();
        }
        this.stoppingCriteria.interrupted = false;

        const temp = customParams.temperature !== undefined ? parseFloat(customParams.temperature) : 0.7;
        const topP = customParams.top_p !== undefined ? parseFloat(customParams.top_p) : 0.9;
        const maxTokens = customParams.max_new_tokens !== undefined ? parseInt(customParams.max_new_tokens, 10) : 512;
        const repPen = customParams.repetition_penalty !== undefined ? parseFloat(customParams.repetition_penalty) : 1.1;

        try {
            const generateOptions = {
                max_new_tokens: maxTokens,
                temperature: temp,
                top_p: topP,
                repetition_penalty: repPen,
                do_sample: temp > 0,
                return_full_text: false,
                stopping_criteria: this.stoppingCriteria ? [this.stoppingCriteria] : [],
                callback_function: (output) => {
                    if (this.abortRequested) {
                        if (this.stoppingCriteria) {
                            if (typeof this.stoppingCriteria.interrupt === "function") {
                                try { this.stoppingCriteria.interrupt(); } catch (e) {}
                            }
                            this.stoppingCriteria.interrupted = true;
                        }
                        return;
                    }

                    const cleanText = this.sanitizeOutput(output, formattedPrompt);
                    if (cleanText) {
                        tokenCount++;
                        const elapsedSec = (Date.now() - startTime) / 1000;
                        const speedTPS = elapsedSec > 0 ? (tokenCount / elapsedSec).toFixed(1) : "0";

                        if (onToken) {
                            onToken({
                                chunk: cleanText,
                                fullText: cleanText,
                                tokens: tokenCount,
                                tps: speedTPS
                            });
                        }
                    }
                }
            };

            const result = await this.activePipeline(formattedPrompt, generateOptions);
            this.isGenerating = false;

            if (this.abortRequested) {
                const partialText = this.sanitizeOutput(result, formattedPrompt);
                if (onComplete) {
                    onComplete({
                        text: partialText || "",
                        tokenCount: tokenCount || 0,
                        tps: "0",
                        stopped: true
                    });
                }
                return;
            }

            const finalCleanText = this.sanitizeOutput(result, formattedPrompt);
            const totalTimeSec = (Date.now() - startTime) / 1000;
            const finalTPS = totalTimeSec > 0 ? (tokenCount / totalTimeSec).toFixed(1) : "0";

            if (onComplete) {
                onComplete({
                    text: finalCleanText || "",
                    tokenCount: tokenCount || 0,
                    tps: finalTPS,
                    totalTimeSec
                });
            }

        } catch (err) {
            this.isGenerating = false;
            if (this.abortRequested) {
                if (onComplete) {
                    onComplete({ text: "", tokenCount: tokenCount || 0, tps: "0", stopped: true });
                }
            } else {
                if (onError) onError(err);
            }
        }
    }

    stopGeneration() {
        this.abortRequested = true;
        this.isGenerating = false;
        if (this.stoppingCriteria) {
            if (typeof this.stoppingCriteria.interrupt === "function") {
                try {
                    this.stoppingCriteria.interrupt();
                } catch (e) {}
            }
            this.stoppingCriteria.interrupted = true;
        }
    }
}

window.aiEngine = new AIEngine();
