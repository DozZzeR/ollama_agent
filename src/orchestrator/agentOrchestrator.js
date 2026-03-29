'use strict';

const { logger } = require('../utils/logger');

/**
 * Agent Orchestrator — the CORE of the system.
 *
 * Responsibilities:
 *   - Maintain messages[] per session
 *   - Run the agent loop (call LLM, handle tool_calls, iterate)
 *   - Return final reply to the transport layer
 *
 * The orchestrator does NOT know about Telegram, HTTP, or storage.
 * It only knows about: LLMProvider, ToolExecutor, and messages[].
 */
class AgentOrchestrator {
  /**
   * @param {object} deps
   * @param {import('../llm/llmProvider').LLMProvider} deps.llmProvider
   * @param {import('../executor/toolExecutor').ToolExecutor}  deps.toolExecutor
   * @param {number} deps.maxSteps
   */
  constructor({ llmProvider, toolExecutor, maxSteps = 10 }) {
    this.llm = llmProvider;
    this.executor = toolExecutor;
    this.maxSteps = maxSteps;

    // Per-session message history. Key: sessionId, Value: messages[]
    this._sessions = new Map();
  }

  /**
   * Get or create message history for a session.
   * @param {string|number} sessionId
   * @returns {Array<object>}
   */
  _getHistory(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, [
        {
          role: 'system',
          content:
            'You are a helpful AI assistant with access to tools. ' +
            'Think step by step. Use tools when needed. ' +
            'When you have the final answer, respond directly to the user.',
        },
      ]);
    }
    return this._sessions.get(sessionId);
  }

  /**
   * Process a user message and return the assistant's final reply.
   *
   * @param {string|number} sessionId  - Unique session/chat identifier
   * @param {string}        userText   - Raw user message text
   * @returns {Promise<string>}        - Final assistant reply
   */
  async run(sessionId, userText) {
    const messages = this._getHistory(sessionId);
    const tools = this.executor ? this.executor.getSchemas() : [];

    // Add user message to history
    messages.push({ role: 'user', content: userText });

    let steps = 0;

    while (steps < this.maxSteps) {
      steps++;
      logger.debug(`[Orchestrator] Session=${sessionId} Step=${steps}`);

      const response = await this.llm.chat(messages, tools);

      // Add assistant response to history
      messages.push(response);

      // Check if LLM wants to call tools
      if (response.tool_calls && response.tool_calls.length > 0) {
        logger.info(`[Orchestrator] Tool calls requested: ${response.tool_calls.length}`);

        for (const toolCall of response.tool_calls) {
          const toolResult = await this._executeToolCall(toolCall);
          messages.push(toolResult);
        }

        // Continue the loop — let LLM process tool results
        continue;
      }

      // No tool calls → final answer
      logger.info(`[Orchestrator] Final answer reached at step ${steps}`);
      return response.content || '';
    }

    logger.warn(`[Orchestrator] Max steps (${this.maxSteps}) reached for session ${sessionId}`);
    return 'Sorry, I was unable to complete the task within the allowed number of steps.';
  }

  /**
   * Execute a single tool call and return the tool result message.
   * @param {object} toolCall
   * @returns {Promise<object>} tool result message for messages[]
   */
  async _executeToolCall(toolCall) {
    const name = toolCall.function?.name;
    const args = toolCall.function?.arguments || {};

    logger.info(`[Orchestrator] Executing tool: ${name}`, args);

    try {
      const result = await this.executor.execute(name, args);
      return {
        role: 'tool',
        name,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      };
    } catch (err) {
      logger.error(`[Orchestrator] Tool "${name}" failed:`, err.message);
      return {
        role: 'tool',
        name,
        content: `Error executing tool "${name}": ${err.message}`,
      };
    }
  }

  /**
   * Clear session history (e.g. on /reset command).
   * @param {string|number} sessionId
   */
  clearSession(sessionId) {
    this._sessions.delete(sessionId);
    logger.info(`[Orchestrator] Session ${sessionId} cleared`);
  }
}

module.exports = { AgentOrchestrator };
