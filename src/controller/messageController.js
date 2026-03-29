'use strict';

const { logger } = require('../utils/logger');

/**
 * Message Controller — entry point for all incoming messages.
 *
 * Responsibilities:
 *   - Normalize raw transport input into a clean { sessionId, text } object
 *   - Delegate processing to the AgentOrchestrator
 *   - Return the final reply string
 *
 * The controller does NOT know about Telegram specifics (ctx, update, etc.).
 * It receives already-normalized data from the transport layer.
 */
class MessageController {
  /**
   * @param {object} deps
   * @param {import('../orchestrator/agentOrchestrator').AgentOrchestrator} deps.orchestrator
   */
  constructor({ orchestrator }) {
    this.orchestrator = orchestrator;
  }

  /**
   * Handle an incoming message.
   *
   * @param {object} input
   * @param {string|number} input.sessionId - Unique chat/session ID
   * @param {string}        input.text      - User message text
   * @returns {Promise<string>}             - Assistant reply
   */
  async handle({ sessionId, text }) {
    logger.info(`[Controller] Message from session=${sessionId}: "${text}"`);

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return 'Please send a text message.';
    }

    const reply = await this.orchestrator.run(sessionId, text.trim());
    return reply;
  }

  /**
   * Handle a /reset command — clears session history.
   * @param {string|number} sessionId
   * @returns {string}
   */
  handleReset(sessionId) {
    this.orchestrator.clearSession(sessionId);
    return 'Conversation history cleared. Starting fresh!';
  }
}

module.exports = { MessageController };
