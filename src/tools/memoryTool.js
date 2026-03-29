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
      const sessionId = context?.sessionId || args.sessionId;
      
      if (!sessionId) {
        throw new Error('sessionId is required to save a fact.');
      }
      
      if (!longTermMemory) {
        throw new Error('LongTermMemory is not available.');
      }

      const fact = (args.fact || '').trim();

      // Validate fact quality — prevent hallucinated garbage
      if (fact.length < 5) {
        return 'Fact too short. Please provide a meaningful fact about the user.';
      }
      if (fact.length > 200) {
        return 'Fact too long. Keep facts concise (under 200 characters).';
      }

      // Block meta-instructions and command-like facts
      const blockedPatterns = [
        /^\//, // starts with slash (command)
        /stop\s*interaction/i,
        /end\s*(the\s*)?conversation/i,
        /wants?\s*to\s*(stop|quit|exit|leave)/i,
        /is\s*an?\s*(end-user|system|bot)\s*request/i,
      ];
      for (const pattern of blockedPatterns) {
        if (pattern.test(fact)) {
          logger.warn(`[MemoryTool] Blocked suspicious fact: "${fact}"`);
          return 'This fact looks like a command or meta-instruction, not a user preference. Fact NOT saved.';
        }
      }

      const id = longTermMemory.saveFact(sessionId, fact);
      if (id !== null) {
        return `Fact successfully saved to memory. It will be recalled in future messages.`;
      } else {
        throw new Error('Failed to save fact to database.');
      }
    }
  };
}

module.exports = { createMemoryTool };
