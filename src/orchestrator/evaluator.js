'use strict';

const { logger } = require('../utils/logger');

class Evaluator {
  /**
   * @param {import('../llm/ollamaProvider').OllamaProvider} llm
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Evaluate the executor's output and decide the next transition.
   *
   * @param {object} step   - The executed step metadata
   * @param {object} result - The output JSON from StepExecutor
   * @param {object} state  - Global context
   * @returns {Promise<object>} JSON representing Evaluator decision
   */
  async evaluate(step, result, state) {
    const prompt = `You are an impartial Evaluation AI orchestrating a state machine.
Assess the execution result of the step and decide the next state transition.

[CONTEXT]
User Request: ${state.userMessage}
Goal: ${state.goal}

[STEP EVALUATED]
Step ID: ${step.id}
Executed outcome: ${result.output_summary}
Needs user input: ${result.needs_user_input} -> ${result.question_for_user}
Suggested next step: ${result.suggested_next}

[INSTRUCTIONS]
Does the outcome solve the current step completely?
Does the goal require more steps, or is the user request fully satisfied?
If the step requires user clarification, decide "wait_user".
If the actor got completely stuck or hallucinations occurred, decide "replan" or "fail".
If the full request is resolved, decide "done".

Output ONLY valid JSON matching this exact schema:
{
  "decision": "done | next_step | wait_user | replan | fail",
  "next_step_id": "step_2 | null",
  "should_replan": false,
  "is_done": boolean,
  "reason": "Explain your logic briefly"
}`;

    const context = [
      { role: 'system', content: 'You are a Strict JSON execution evaluator. Output only JSON.' },
      { role: 'user', content: prompt }
    ];

    try {
      logger.info(`[Evaluator] Judging result of ${step.id}...`);
      const response = await this.llm.chat(context, [], 'json');
      return JSON.parse(response.content);
    } catch (err) {
      logger.warn(`[Evaluator] Failed to evaluate: ${err.message}. Assuming "done" for safety if it's the last step.`);
      // Return a safe fallback error state
      return { decision: 'fail', reason: 'Evaluator threw an error' };
    }
  }
}

module.exports = { Evaluator };
