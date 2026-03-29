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
   * @param {Function}      [input.onEvent] - Optional callback for live events
   * @returns {Promise<string>}             - Assistant reply
   */
  async handle({ sessionId, text, onEvent = () => {} }) {
    logger.info(`[Controller] Message from session=${sessionId}: "${text}"`);

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return 'Please send a text message.';
    }

    const reply = await this.orchestrator.run(sessionId, text.trim(), onEvent);
    return reply;
  }

  /**
   * Handle a /plan command — toggles planning mode lock.
   * @param {string|number} sessionId
   * @returns {string}
   */
  handleTogglePlan(sessionId) {
    if (!this.orchestrator.memoryManager) return 'Memory Manager not injected';
    const isCurrentlyEnabled = this.orchestrator.memoryManager.isPlanningEnabled(sessionId);
    this.orchestrator.memoryManager.setPlanningEnabled(sessionId, !isCurrentlyEnabled);
    return `Режим инструментов: ${!isCurrentlyEnabled ? 'ВКЛ' : 'ВЫКЛ'} (для следующего сообщения)`;
  }
  /**
   * Handle a /reset command — clears session history.
   * @param {string|number} sessionId
   * @returns {string}
   */
  handleReset(sessionId) {
    if (this.orchestrator.memoryManager) {
        this.orchestrator.memoryManager.clearSession(sessionId);
    } else {
        this.orchestrator.clearSession(sessionId);
    }
    return 'Conversation history cleared. Starting fresh!';
  }
}

module.exports = { MessageController };
