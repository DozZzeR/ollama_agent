'use strict';

const { logger } = require('../utils/logger');

/**
 * MemoryManager coordinates both short-term context and long-term facts.
 * It builds the final context array for the LLM.
 */
class MemoryManager {
  /**
   * @param {object} deps 
   * @param {import('./shortTermMemory').ShortTermMemory} deps.shortTerm
   * @param {import('./longTermMemory').LongTermMemory} deps.longTerm
   * @param {number} deps.maxHistoryMessages
   */
  constructor({ shortTerm, longTerm, maxHistoryMessages = 50 }) {
    this.shortTerm = shortTerm;
    this.longTerm = longTerm;
    this.maxHistoryMessages = maxHistoryMessages;

    this.baseSystemPrompt = 
      'You are a helpful AI assistant with access to tools. ' +
      'Think step by step. Use tools when needed. ' +
      'When you have the final answer, respond directly to the user.';
  }

  /**
   * Build the complete context for the LLM including system prompt, facts and history.
   * @param {string|number} sessionId 
   * @returns {Array<object>} messages array for LLM
   */
  getHistoryContext(sessionId) {
    // 1. Get raw history from short-term memory
    let history = this.shortTerm.getHistory(sessionId);

    // 2. Perform context trimming if we exceed max limit
    // We only trim if it's too long, but we must make sure we don't sever tool_calls from tool responses
    // For now, a simple trim of oldest messages (excluding system prompt if any was there).
    if (history.length > this.maxHistoryMessages) {
      // Keep last N messages
      history = history.slice(-this.maxHistoryMessages);
      this.shortTerm.setHistory(sessionId, history);
      logger.info(`[MemoryManager] Trimmed context for session ${sessionId} to ${this.maxHistoryMessages} messages.`);
    }

    // 3. Get facts from long-term memory
    let systemPrompt = this.baseSystemPrompt;
    if (this.longTerm) {
      const facts = this.longTerm.getFacts(sessionId);
      if (facts && facts.length > 0) {
        systemPrompt += '\n\nHere are some facts you know about the user:\n';
        systemPrompt += facts.map(f => `- ${f}`).join('\n');
      }
    }

    // 4. Return assembled messages array
    return [
      { role: 'system', content: systemPrompt },
      ...history
    ];
  }

  /**
   * Add a single message to short term memory
   */
  addMessage(sessionId, message) {
    this.shortTerm.addMessage(sessionId, message);
  }

  /**
   * Add multiple messages (e.g. tool results)
   */
  addMessages(sessionId, messages) {
    this.shortTerm.addMessages(sessionId, messages);
  }

  /**
   * Save a fact to long term memory manually (or internally)
   */
  saveFact(sessionId, fact) {
    if (this.longTerm) {
      this.longTerm.saveFact(sessionId, fact);
    }
  }

  /**
   * Clear short-term session memory
   */
  clearSession(sessionId) {
    this.shortTerm.clearHistory(sessionId);
  }
}

module.exports = { MemoryManager };
