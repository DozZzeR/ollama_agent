'use strict';

const { z } = require('zod');
const { logger } = require('../utils/logger');

/**
 * Creates the memory tool and wires it to longTermMemory
 * @param {import('../memory/longTermMemory').LongTermMemory} longTermMemory 
 */
function createMemoryTool(longTermMemory) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'remember_fact',
        description: 'Save a persistent fact or preference about the user to long-term memory.',
        parameters: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'The session ID or user ID (pass the implicit context or omit if context injection is supported. For now, we will assume orchestrator overrides it or ignores it if injected)',
            },
            fact: {
              type: 'string',
              description: 'The single, concise fact to remember about the user (e.g. "User likes coffee", "User\'s name is Alex").',
            },
          },
          required: ['fact'],
        },
      },
    },
    
    /**
     * @param {object} args
     * @param {object} context - context passed by toolExecutor
     * @returns {Promise<string>}
     */
    handler: async (args, context) => {
      // If we have a sessionId in context (we need to update toolExecutor to pass it), we use it.
      // Otherwise we fall back to args.sessionId
      const sessionId = context?.sessionId || args.sessionId;
      
      if (!sessionId) {
        throw new Error('sessionId is required to save a fact.');
      }
      
      if (!longTermMemory) {
        throw new Error('LongTermMemory is not available.');
      }

      const id = longTermMemory.saveFact(sessionId, args.fact);
      if (id !== null) {
        return `Fact successfully saved to memory. It will be recalled in future messages.`;
      } else {
        throw new Error('Failed to save fact to database.');
      }
    }
  };
}

module.exports = { createMemoryTool };
