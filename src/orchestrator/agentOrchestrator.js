'use strict';

const { logger } = require('../utils/logger');
const { config } = require('../config');
const { Triage } = require('./triage');

const DEBUG = config.log.level === 'debug';

class AgentOrchestrator {
  /**
   * @param {object} deps
   * @param {import('../llm/llmProvider').LLMProvider} deps.llmProvider
   * @param {import('../executor/toolExecutor').ToolExecutor}  deps.toolExecutor
   * @param {import('../memory/memoryManager').MemoryManager} deps.memoryManager
   */
  constructor({ llmProvider, toolExecutor, memoryManager }) {
    this.llm = llmProvider;
    this.memoryManager = memoryManager;
    this.toolExecutor = toolExecutor;

    this.longTerm = memoryManager.longTerm;
    const dbRepo = memoryManager.longTerm?.runs;
    this.dbRepo = dbRepo;

    this.triage = new Triage(this.llm);

    this.MAX_TOOL_ITERATIONS = 10;
  }

  /**
   * Wrapper around llm.chat that logs to debug_log when LOG_LEVEL=debug.
   * Catches LLM errors and logs them too.
   */
  async _llmChat(messages, tools, { sessionId, mode, iteration }) {
    const start = Date.now();
    let response;
    let error = null;

    try {
      response = await this.llm.chat(messages, tools);
    } catch (err) {
      error = err;
      response = { role: 'assistant', content: null, error: err.message };
    }

    const durationMs = Date.now() - start;

    if (DEBUG && this.longTerm) {
      this.longTerm.logDebug({
        sessionId,
        mode,
        iteration,
        messages,
        tools,
        response: error ? { error: error.message } : response,
        durationMs,
      });
    }

    logger.debug(`[Orchestrator] LLM call: mode=${mode} iter=${iteration} duration=${durationMs}ms`);

    if (error) {
      throw error;
    }
    return response;
  }

  /**
   * Main entry point. Routes between DIRECT and TOOL_LOOP.
   */
  async run(sessionId, userText, onEvent = () => {}) {
    logger.info(`[Orchestrator] Processing message from ${sessionId}: ${userText.substring(0, 60)}`);

    // 1. Triage
    let triageDecision = 'TOOL_LOOP';
    let triageScore = 0;

    if (this.memoryManager.isForceToolsNext(sessionId)) {
      logger.info('[Orchestrator] TOOL_LOOP forced by /tools command');
      triageScore = 99;
      this.memoryManager.setForceToolsNext(sessionId, false);
    } else if (config.agent.forceToolLoop) {
      // FORCE_TOOL_LOOP=true (default) — model always gets tools, decides itself
      triageScore = -1;
    } else {
      // FORCE_TOOL_LOOP=false — triage decides (for weak models)
      const result = await this.triage.evaluate(userText);
      triageDecision = result.decision;
      triageScore = result.score;
    }

    // 2. Create DB Run
    let runId = null;
    if (this.dbRepo) {
      runId = this.dbRepo.createRun(sessionId, userText, triageScore, triageDecision);
    }

    // 3. Execute
    let reply = '';
    let toolsCalled = [];
    let finalState = 'COMPLETED';

    try {
      if (triageDecision === 'DIRECT') {
        reply = await this._directAnswer(sessionId, userText);
      } else {
        const result = await this._toolLoop(sessionId, userText, onEvent);
        reply = result.content;
        toolsCalled = result.toolsCalled;
      }
    } catch (err) {
      logger.error(`[Orchestrator] Error: ${err.message}`);
      reply = '⚠️ Произошла ошибка при обработке запроса. Попробуйте ещё раз.';
      finalState = 'FAILED';
    }

    // 4. ALWAYS log result to DB (even on error)
    if (this.dbRepo && runId) {
      try {
        this.dbRepo.updateRun(runId, {
          state: finalState,
          model_response: reply || '(empty)',
          tools_called: toolsCalled.length > 0 ? JSON.stringify(toolsCalled) : null,
        });
      } catch (dbErr) {
        logger.error(`[Orchestrator] DB update failed: ${dbErr.message}`);
      }
    }

    return reply || '⚠️ Не удалось получить ответ.';
  }

  /**
   * DIRECT mode — simple chat, no tools. For trivial messages (score ≤ 1).
   */
  async _directAnswer(sessionId, userText) {
    this.memoryManager.addMessage(sessionId, { role: 'user', content: userText });
    const messages = this.memoryManager.getHistoryContext(sessionId, { includeToolHints: false });
    const response = await this._llmChat(messages, [], { sessionId, mode: 'DIRECT', iteration: 1 });
    this.memoryManager.addMessage(sessionId, response);
    return response.content || '';
  }

  /**
   * TOOL_LOOP — chat with tools. Model decides when to call tools.
   * Standard agent loop: LLM → tool_calls? → execute → loop.
   */
  async _toolLoop(sessionId, userText, onEvent) {
    this.memoryManager.addMessage(sessionId, { role: 'user', content: userText });

    const toolSchemas = this.toolExecutor.getSchemas();
    const toolsCalled = [];
    let iterations = 0;
    let emptyResponses = 0;

    while (iterations < this.MAX_TOOL_ITERATIONS) {
      iterations++;

      // Build context with tool-aware system prompt
      const messages = this.memoryManager.getHistoryContext(sessionId, { includeToolHints: true });

      // Call LLM with tool schemas (debug logged automatically)
      let response;
      try {
        response = await this._llmChat(messages, toolSchemas, {
          sessionId, mode: 'TOOL_LOOP', iteration: iterations,
        });
      } catch (llmErr) {
        logger.error(`[Orchestrator] LLM call failed in TOOL_LOOP iter=${iterations}: ${llmErr.message}`);
        // If LLM itself failed, add an error hint and try once more without tools
        if (iterations < this.MAX_TOOL_ITERATIONS) {
          this.memoryManager.addMessage(sessionId, {
            role: 'assistant',
            content: null,
          });
          // Retry without tools to get at least a text response
          try {
            const fallbackMessages = this.memoryManager.getHistoryContext(sessionId, { includeToolHints: false });
            response = await this._llmChat(fallbackMessages, [], {
              sessionId, mode: 'TOOL_LOOP_FALLBACK', iteration: iterations,
            });
            if (response.content) {
              this.memoryManager.addMessage(sessionId, response);
              return { content: response.content, toolsCalled };
            }
          } catch {
            // Give up
          }
        }
        break;
      }

      // Case 1: Model wants to call tools
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Add assistant message (with tool_calls) to history
        this.memoryManager.addMessage(sessionId, response);

        // Execute each tool call
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments || {};

          logger.info(`[Orchestrator] Tool call: ${toolName}(${JSON.stringify(toolArgs)})`);
          try { await onEvent({ type: 'tool_start', data: toolName }); } catch(e) {}

          let toolResult;
          let toolStatus = 'ok';

          try {
            toolResult = await this.toolExecutor.execute(toolName, toolArgs, { sessionId });
          } catch (err) {
            toolResult = `[Tool Error] ${toolName} failed: ${err.message}. Try a different approach or URL, or tell the user you could not retrieve the data.`;
            toolStatus = 'error';
            logger.warn(`[Orchestrator] Tool error: ${toolName} — ${err.message}`);
          }

          toolsCalled.push({ name: toolName, args: toolArgs, status: toolStatus });

          try { await onEvent({ type: 'tool_end', data: toolName }); } catch(e) {}

          // Add tool result to messages for the model to process
          this.memoryManager.addMessage(sessionId, {
            role: 'tool',
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          });
        }

        continue; // Loop back — let model process tool results
      }

      // Case 2: Model returns final text answer
      if (response.content) {
        this.memoryManager.addMessage(sessionId, response);
        return { content: response.content, toolsCalled };
      }

      // Case 3: Empty response — nudge model to respond
      emptyResponses++;
      logger.warn(`[Orchestrator] LLM returned empty in TOOL_LOOP iter=${iterations} (empty count: ${emptyResponses})`);

      if (emptyResponses >= 2) {
        // Gave model 2 chances, still empty — give up
        break;
      }

      // Add a nudge to make the model respond with text
      this.memoryManager.addMessage(sessionId, {
        role: 'user',
        content: '[System: Please provide your final answer as text. Do not call any more tools.]',
      });
    }

    if (iterations >= this.MAX_TOOL_ITERATIONS) {
      logger.warn('[Orchestrator] Reached max tool loop iterations');
    }

    return {
      content: '⚠️ Не удалось получить финальный ответ. Попробуйте переформулировать запрос.',
      toolsCalled,
    };
  }

  clearSession(sessionId) {
    this.memoryManager.clearSession(sessionId);
    logger.info(`[Orchestrator] Session ${sessionId} cleared via MemoryManager`);
  }
}

module.exports = { AgentOrchestrator };
