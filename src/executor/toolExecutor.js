'use strict';

const { logger } = require('../utils/logger');

/**
 * Tool Executor — safe execution layer for all tools.
 *
 * Responsibilities:
 *   - Maintain the tool registry (name → handler)
 *   - Validate that the requested tool exists
 *   - Execute the tool with a timeout
 *   - Enforce response size limits
 *
 * The executor does NOT know about LLM, Telegram, or orchestrator internals.
 */
class ToolExecutor {
  /**
   * @param {object} options
   * @param {number} options.timeoutMs        - Per-tool execution timeout
   * @param {number} options.maxResponseBytes - Max tool response size
   */
  constructor({ timeoutMs = 10000, maxResponseBytes = 32768 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;

    /** @type {Map<string, { schema: object, handler: Function }>} */
    this._registry = new Map();
  }

  /**
   * Register a tool.
   * @param {string}   name    - Tool name (must match LLM tool schema name)
   * @param {object}   schema  - JSON schema object describing the tool for the LLM
   * @param {Function} handler - Async function (args) => result
   */
  register(name, schema, handler) {
    this._registry.set(name, { schema, handler });
    logger.debug(`[ToolExecutor] Registered tool: ${name}`);
  }

  /**
   * Returns all tool schemas (to be passed to LLM).
   * @returns {Array<object>}
   */
  getSchemas() {
    return Array.from(this._registry.values()).map((t) => t.schema);
  }

  /**
   * Execute a tool by name with given arguments.
   * @param {string} name
   * @param {object} args
   * @param {object} context - Execution context (e.g. sessionId)
   * @returns {Promise<string>} Stringified result
   */
  async execute(name, args, context = {}) {
    const tool = this._registry.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: "${name}"`);
    }

    // Execute with timeout
    const result = await this._withTimeout(
      tool.handler(args, context),
      this.timeoutMs,
      `Tool "${name}" timed out after ${this.timeoutMs}ms`
    );

    // Enforce size limit
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    if (Buffer.byteLength(resultStr, 'utf8') > this.maxResponseBytes) {
      logger.warn(`[ToolExecutor] Tool "${name}" response truncated`);
      return resultStr.slice(0, this.maxResponseBytes) + '\n[...truncated]';
    }

    return resultStr;
  }

  /**
   * Wraps a promise with a timeout.
   * @param {Promise<any>} promise
   * @param {number}       ms
   * @param {string}       errorMessage
   * @returns {Promise<any>}
   */
  _withTimeout(promise, ms, errorMessage) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(errorMessage)), ms);
      promise
        .then((value) => { clearTimeout(timer); resolve(value); })
        .catch((err)  => { clearTimeout(timer); reject(err); });
    });
  }
}

module.exports = { ToolExecutor };
