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

    // System prompt for DIRECT mode: knows about capabilities but can't use them
    this.directSystemPrompt =
      'CRITICAL RULE: You MUST respond in the SAME language the user uses. ' +
      'If the user writes in Russian — your ENTIRE response must be in Russian. ' +
      'If the user writes in English — respond in English. Never mix languages.\n\n' +
      'You are a friendly and helpful AI assistant.\n' +
      'Be natural, concise, and helpful. Do NOT output JSON or function calls.\n\n' +
      'You have the following capabilities (available for complex requests):\n' +
      '- http_fetch: fetch web pages, news, data from the internet\n' +
      '- get_current_time: get current date and time\n' +
      '- remember_fact: save information about the user (preferences, style, personal data)\n' +
      'These tools are not active right now (this is a simple chat). ' +
      'If the user asks to use them, or asks a question that needs internet data, ' +
      'tell them you can do it and will use your tools for the next message.\n' +
      'Do NOT pretend to call tools — just answer naturally.';

    // System prompt for TOOL_LOOP mode: tools available with specific guidance
    this.toolSystemPrompt =
      'CRITICAL RULE: You MUST respond in the SAME language the user uses. ' +
      'If the user writes in Russian — your ENTIRE response must be in Russian. ' +
      'If the user writes in English — respond in English. Never mix languages.\n\n' +
      'You are a helpful AI assistant with access to tools.\n\n' +
      'YOUR TOOLS:\n' +
      '- http_fetch: fetch web pages, news (use Google News RSS: news.google.com/rss), weather, etc.\n' +
      '- get_current_time: get current date and time\n' +
      '- remember_fact: save facts about the user for future conversations\n\n' +
      'WHEN TO USE remember_fact:\n' +
      '- User shares personal info (name, age, profession, location)\n' +
      '- User states preferences ("don\'t ask me questions at the end", "respond briefly")\n' +
      '- User requests a specific communication style or format\n' +
      '- Any info the user explicitly asks you to remember\n\n' +
      'TOOL RULES:\n' +
      '- NEVER simulate tool results. If you did not call a tool, you do NOT have that data.\n' +
      '- If a fetch fails — try a different URL or tell the user honestly.\n' +
      '- After receiving tool results, summarize them for the user.\n' +
      '- For simple questions — just answer directly without calling tools.';
  }

  /**
   * Build the complete context for the LLM including system prompt, facts and history.
   * @param {string|number} sessionId
   * @param {object} [options]
   * @param {boolean} [options.includeToolHints=true] - If false, use a simpler system prompt without tool references
   * @returns {Array<object>} messages array for LLM
   */
  getHistoryContext(sessionId, { includeToolHints = true } = {}) {
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
    let systemPrompt = includeToolHints ? this.toolSystemPrompt : this.directSystemPrompt;
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
   * Check if next message should be forced into TOOL_LOOP (via /tools command)
   */
  isForceToolsNext(sessionId) {
    const prefs = this.shortTerm.getPrefs(sessionId);
    return prefs.forceToolsNext === true;
  }

  /**
   * Set force-tools flag for next message
   */
  setForceToolsNext(sessionId, enabled) {
    this.shortTerm.setPref(sessionId, 'forceToolsNext', enabled);
  }

  /**
   * Clear short-term session memory
   */
  clearSession(sessionId) {
    this.shortTerm.clearHistory(sessionId);
  }
}

module.exports = { MemoryManager };
