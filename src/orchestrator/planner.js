'use strict';

const { logger } = require('../utils/logger');

class Planner {
  /**
   * @param {import('../llm/ollamaProvider').OllamaProvider} llm
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Create a plan for the user's task.
   * @param {string} userMessage 
   * @returns {Promise<object>} The plan JSON
   */
  async createPlan(userMessage) {
    const prompt = `You are a high-level Planning AI. Your job is to break down the user's request into a strict sequence of steps.
You must output ONLY valid JSON matching this exact schema:

{
  "goal": "Brief description of what we are trying to achieve",
  "success_criteria": ["condition 1", "condition 2"],
  "steps": [
    {
      "id": "step_1",
      "title": "Brief action description",
      "status": "pending",
      "depends_on": [],
      "kind": "tool"
    }
  ],
  "current_step_id": "step_1",
  "version": 1
}

Constraints:
- Maximum 5 steps.
- Minimum 1 step.
- "kind" must be one of: "reasoning", "tool", "answer".
- Linear dependencies only (e.g. step_2 depends_on ["step_1"]).
- Output ONLY JSON. Do not wrap in markdown or backticks.

User request: "${userMessage}"`;

    const context = [
      { role: 'system', content: 'You are a Strict JSON planner agent. Output only JSON.' },
      { role: 'user', content: prompt }
    ];

    try {
      logger.info('[Planner] Generating JSON plan...');
      const response = await this.llm.chat(context, [], 'json');
      const plan = JSON.parse(response.content);
      
      // Basic validation
      if (!plan.steps || plan.steps.length === 0) {
        throw new Error('Plan contains no steps');
      }
      
      return plan;
    } catch (err) {
      logger.error(`[Planner] Failed to create plan: ${err.message}`);
      throw new Error(`Planner failed: ${err.message}`);
    }
  }
}

module.exports = { Planner };
