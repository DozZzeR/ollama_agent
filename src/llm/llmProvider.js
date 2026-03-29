'use strict';

/**
 * Abstract LLM Provider interface.
 * All concrete providers must extend this class and implement `chat`.
 *
 * messages[] format (OpenAI-compatible):
 *   [{ role: 'system'|'user'|'assistant'|'tool', content: string, ... }]
 */
class LLMProvider {
  /**
   * Send messages to the LLM and return the response message object.
   *
   * @param {Array<object>} messages - Conversation history
   * @param {Array<object>} [tools]  - Optional tool schemas to expose to LLM
   * @returns {Promise<object>} - Response message: { role, content, tool_calls? }
   */
  // eslint-disable-next-line no-unused-vars
  async chat(messages, tools = []) {
    throw new Error(`${this.constructor.name}.chat() is not implemented`);
  }
}

module.exports = { LLMProvider };
