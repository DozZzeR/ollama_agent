const { MemoryManager } = require('../../../src/memory/memoryManager');
const { ShortTermMemory } = require('../../../src/memory/shortTermMemory');

describe('MemoryManager', () => {
  let shortTerm;
  let longTermMock;
  let memoryManager;

  beforeEach(() => {
    shortTerm = new ShortTermMemory();
    longTermMock = {
      getFacts: jest.fn().mockReturnValue([]),
      saveFact: jest.fn(),
    };
    memoryManager = new MemoryManager({
      shortTerm,
      longTerm: longTermMock,
      maxHistoryMessages: 5,
    });
  });

  test('should return base system prompt for empty memory', () => {
    const context = memoryManager.getHistoryContext('session_1');
    expect(context).toHaveLength(1);
    expect(context[0].role).toBe('system');
    expect(context[0].content).toContain('You are a helpful AI assistant');
  });

  test('should inject facts into system prompt if available', () => {
    longTermMock.getFacts.mockReturnValue(['User is named Alex', 'User likes tea']);
    
    const context = memoryManager.getHistoryContext('session_1');
    expect(context[0].content).toContain('Here are some facts');
    expect(context[0].content).toContain('- User is named Alex');
    expect(context[0].content).toContain('- User likes tea');
  });

  test('should trim memory if exceeds max limit (excluding system prompt)', () => {
    // Add 8 messages, limit is 5
    for (let i = 0; i < 8; i++) {
        memoryManager.addMessage('session_1', { role: 'user', content: `msg_${i}` });
    }

    const context = memoryManager.getHistoryContext('session_1');
    
    // Total should be 1 (system) + 5 (trimmed history) = 6
    expect(context).toHaveLength(6);
    expect(context[0].role).toBe('system');
    
    // Should keep the LAST 5 messages (msg_3 to msg_7)
    expect(context[1].content).toBe('msg_3');
    expect(context[5].content).toBe('msg_7');
  });
});
