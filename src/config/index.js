'use strict';

require('dotenv').config();

/**
 * Central config object. All environment variables are read here.
 * No other module should read process.env directly.
 */
const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number),
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 60000,
  },

  agent: {
    maxSteps: Number(process.env.AGENT_MAX_STEPS) || 10,
    planningEnabled: process.env.AGENT_PLANNING_ENABLED === 'true',
  },

  tool: {
    timeoutMs: Number(process.env.TOOL_TIMEOUT_MS) || 10000,
    maxResponseBytes: Number(process.env.TOOL_MAX_RESPONSE_BYTES) || 32768,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required fields at startup
function validate() {
  if (!config.telegram.botToken) {
    throw new Error('Config error: TELEGRAM_BOT_TOKEN is not set');
  }
}

module.exports = { config, validate };
