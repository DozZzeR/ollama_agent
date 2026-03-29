'use strict';

const { logger } = require('../utils/logger');

class StepExecutor {
  /**
   * @param {import('../llm/ollamaProvider').OllamaProvider} llm
   * @param {import('../tools/toolExecutor').ToolExecutor} [toolExecutor]
   */
  constructor(llm, toolExecutor) {
    this.llm = llm;
    this.toolExecutor = toolExecutor;
  }

  /**
   * Execute a single step in the state machine using the LLM.
   *
   * @param {object} step    - The current step from the plan
   * @param {object} state   - High level state context { userMessage, goal }
   * @param {Array} history  - Previous steps summary or results
   * @returns {Promise<object>} JSON representing Executor Output
   */
  async execute(step, state, history) {
    const toolsContext = this.toolExecutor
      ? JSON.stringify(this.toolExecutor.getSchemas(), null, 2)
      : '[]';

    const historyContext = history.length > 0
      ? JSON.stringify(history, null, 2)
      : 'No previous steps executed.';

    const prompt = `You are a strict step-execution agent.
Your objective is to execute the current step ONLY. Do not attempt to complete the full goal.

[CONTEXT]
User Request: ${state.userMessage}
Goal: ${state.goal}
Past steps results:
${historyContext}

[CURRENT STEP TO EXECUTE]
Step ID: ${step.id}
Title: ${step.title}
Kind: ${step.kind}

[AVAILABLE TOOLS]
${toolsContext}

[INSTRUCTIONS]
Decide if you need to use a tool to complete this step, or if you can complete it immediately based on past results.
If you need a tool, specify it in "tool_request". If not, provide the outcome in "output_summary" and set status to "completed".

Output strictly valid JSON matching this exact schema:
{
  "step_id": "${step.id}",
  "status": "completed | blocked | tool_running",
  "output_summary": "What was achieved or discovered",
  "tool_request": { "name": "tool_name", "args": { "param": "val" } } | null,
  "needs_user_input": boolean,
  "question_for_user": "string | null",
  "suggested_next": "next step_id | null"
}
`;

    const context = [
      { role: 'system', content: 'You are a Strict JSON execution agent. Output only JSON.' },
      { role: 'user', content: prompt }
    ];

    try {
      logger.info(`[StepExecutor] Executing step: ${step.id} (${step.title})`);
      const response = await this.llm.chat(context, [], 'json');
      const result = JSON.parse(response.content);
      return result;
    } catch (err) {
      logger.error(`[StepExecutor] Failed to execute step ${step.id}: ${err.message}`);
      throw new Error(`Execution failed at ${step.id}: ${err.message}`);
    }
  }
}

module.exports = { StepExecutor };
