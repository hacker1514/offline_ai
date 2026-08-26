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

        window.modelResolver.setupTransformersEnv();

        try {
            const pipelineFunc = window.TransformersJS.pipeline;

            const options = {
                device: this.device,
                dtype: model.dtype || "q4",
                progress_callback: (progressInfo) => {
                    if (onProgress) onProgress(progressInfo);
                }
            };

            this.activePipeline = await pipelineFunc(model.task || "text-generation", model.modelId, options);
            this.activeModel = model;

            return { ok: true, device: this.device, model };
        } catch (err) {
            console.warn(`[AI Engine] Primary load failed on ${this.device}: ${err.message}. Fallback to WASM...`);
            if (this.device === "webgpu") {
                this.device = "wasm";
                return this.loadModel(model, onProgress);
            }
            throw err;
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

        const InterruptableStoppingCriteria = window.TransformersJS ? window.TransformersJS.InterruptableStoppingCriteria : null;
        if (InterruptableStoppingCriteria) {
            this.stoppingCriteria = new InterruptableStoppingCriteria();
        }

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
                            try { this.stoppingCriteria.interrupt(); } catch (e) {}
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
                if (onComplete) {
                    onComplete({ text: "", tokenCount: 0, tps: "0", stopped: true });
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
                    onComplete({ text: "", tokenCount: 0, tps: "0", stopped: true });
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
            try {
                this.stoppingCriteria.interrupt();
            } catch (e) {}
        }
    }
}

window.aiEngine = new AIEngine();
