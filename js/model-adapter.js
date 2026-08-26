class ModelAdapter {
    formatPrompt(model, messages, systemPrompt) {
        const sys = systemPrompt || window.KNI_CONFIG.DEFAULT_SYSTEM_PROMPT;
        const budgetMessages = this.truncateContext(messages, model.contextWindow || 2048);

        if (model.id.includes("qwen") || model.id.includes("smollm") || model.id.includes("tinyllama")) {
            let prompt = `<|im_start|>system\n${sys}<|im_end|>\n`;
            for (const msg of budgetMessages) {
                prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
            }
            prompt += `<|im_start|>assistant\n`;
            return prompt;
        }

        if (model.id.includes("gemma")) {
            let prompt = `<start_of_turn>user\n${sys}\n\n`;
            for (const msg of budgetMessages) {
                if (msg.role === "user") {
                    prompt += `${msg.content}<end_of_turn>\n`;
                } else if (msg.role === "assistant") {
                    prompt += `<start_of_turn>model\n${msg.content}<end_of_turn>\n`;
                }
            }
            prompt += `<start_of_turn>model\n`;
            return prompt;
        }

        const lastUserMsg = budgetMessages.filter(m => m.role === "user").pop();
        const queryText = lastUserMsg ? lastUserMsg.content : "Hello";
        return `User: ${queryText}\nAssistant:`;
    }

    truncateContext(messages, maxTokens) {
        const maxChars = maxTokens * 3.5;
        let currentChars = 0;
        const result = [];

        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const len = msg.content ? msg.content.length : 0;

            if (currentChars + len > maxChars && result.length > 0) {
                break;
            }

            result.unshift(msg);
            currentChars += len;
        }

        return result;
    }
}

window.modelAdapter = new ModelAdapter();
