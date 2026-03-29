'use strict';

const { logger } = require('../utils/logger');

/**
 * Short-term memory store.
 * Holds recent conversational history per session in memory.
 */
class ShortTermMemory {
  constructor() {
    this._sessions = new Map();
    this._prefs = new Map();
  }

  /**
   * Get session preferences
   * @param {string|number} sessionId 
   * @returns {object}
   */
  getPrefs(sessionId) {
    if (!this._prefs.has(sessionId)) {
      this._prefs.set(sessionId, {});
    }
    return this._prefs.get(sessionId);
  }

  /**
   * Set a session preference
   */
  setPref(sessionId, key, value) {
    const prefs = this.getPrefs(sessionId);
    prefs[key] = value;
  }

  /**
   * Get or create message history for a session.
   * @param {string|number} sessionId
   * @returns {Array<object>}
   */
  getHistory(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, []);
    }
    return this._sessions.get(sessionId);
  }

  /**
   * Add a message to the session's history.
   * @param {string|number} sessionId 
   * @param {object} message 
   */
  addMessage(sessionId, message) {
    const history = this.getHistory(sessionId);
    history.push(message);
  }

  /**
   * Add multiple messages to the session's history.
   * @param {string|number} sessionId 
   * @param {Array<object>} messages 
   */
  addMessages(sessionId, messages) {
    const history = this.getHistory(sessionId);
    history.push(...messages);
  }

  /**
   * Overwrite history (e.g. after trimming)
   * @param {string|number} sessionId 
   * @param {Array<object>} messages 
   */
  setHistory(sessionId, messages) {
    this._sessions.set(sessionId, messages);
  }

  /**
   * Clear session history.
   * @param {string|number} sessionId
   */
  clearHistory(sessionId) {
    this._sessions.delete(sessionId);
    logger.info(`[ShortTermMemory] Session ${sessionId} cleared`);
  }
}

module.exports = { ShortTermMemory };
