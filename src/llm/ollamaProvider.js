'use strict';

const axios = require('axios');
const { LLMProvider } = require('./llmProvider');
const { config } = require('../config');

/**
 * Ollama LLM Provider.
 * Uses the Ollama /api/chat endpoint (OpenAI-compatible format).
 * Ref: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
class OllamaProvider extends LLMProvider {
  constructor() {
    super();
    this.baseUrl = config.ollama.baseUrl;
    this.model = config.ollama.model;
    this.timeoutMs = config.ollama.timeoutMs;
  }

  /**
   * @param {Array<object>} messages
   * @param {Array<object>} [tools]
   * @returns {Promise<object>} response message
   */
  async chat(messages, tools = []) {
    const payload = {
      model: this.model,
      messages,
      stream: false,
    };

    if (tools.length > 0) {
      payload.tools = tools;
    }

    const response = await axios.post(`${this.baseUrl}/api/chat`, payload, {
      timeout: this.timeoutMs,
    });

    // Ollama returns: { message: { role, content, tool_calls? }, ... }
    const message = response.data?.message;
    if (!message) {
      throw new Error('OllamaProvider: unexpected response structure');
    }

    return message;
  }
}

module.exports = { OllamaProvider };
