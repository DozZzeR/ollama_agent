'use strict';

/**
 * Tool for the LLM to explicitly reason and plan before acting.
 * Essentially acts as an internal chain-of-thought mechanism.
 */
function createReasoningTool() {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'think_and_plan',
        description: 'Use this tool before taking action to break down a complex problem into steps. Document your reasoning so you can follow it in subsequent steps.',
        parameters: {
          type: 'object',
          properties: {
            reasoning: {
              type: 'string',
              description: 'Your internal thought process. Why are you choosing this plan?',
            },
            plan: {
              type: 'array',
              items: { type: 'string' },
              description: 'A clear, step-by-step list of actions you intend to perform using your available tools.',
            },
          },
          required: ['reasoning', 'plan'],
        },
      },
    },

    /**
     * @param {object} args
     * @returns {Promise<string>}
     */
    handler: async (args) => {
      // We don't need to 'do' anything but echo the plan back to the LLM so it stays in messages[] as a tool result
      const stepStr = (args.plan || []).map((step, idx) => `${idx + 1}. ${step}`).join('\n');
      return `Plan successfully recorded. Please proceed with step 1.\n\nYour plan:\n${stepStr}`;
    }
  };
}

module.exports = { createReasoningTool };
