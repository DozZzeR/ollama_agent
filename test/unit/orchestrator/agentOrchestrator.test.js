const { AgentOrchestrator } = require('../../../src/orchestrator/agentOrchestrator');
const { MemoryManager } = require('../../../src/memory/memoryManager');
const { ShortTermMemory } = require('../../../src/memory/shortTermMemory');

describe('AgentOrchestrator', () => {
  let orchestrator;
  let mockLLM;
  let mockExecutor;
  let memoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager({ shortTerm: new ShortTermMemory(), maxHistoryMessages: 10 });
    
    mockLLM = {
      chat: jest.fn(),
    };
    
    mockExecutor = {
      getSchemas: jest.fn().mockReturnValue([{ function: { name: 'f1' } }]),
      execute: jest.fn(),
    };
    
    orchestrator = new AgentOrchestrator({
      llmProvider: mockLLM,
      toolExecutor: mockExecutor,
      memoryManager,
      maxSteps: 3,
    });
  });

  test('should handle simple conversation without tool calls', async () => {
    mockLLM.chat.mockResolvedValueOnce({ role: 'assistant', content: 'hello user!' });

    const reply = await orchestrator.run('session_1', 'hi');
    
    expect(reply).toBe('hello user!');
    expect(mockLLM.chat).toHaveBeenCalledTimes(1);
    
    // Verify memory got populated
    const history = memoryManager.getHistoryContext('session_1');
    expect(history.find(m => m.content === 'hi')).toBeDefined();
    expect(history.find(m => m.content === 'hello user!')).toBeDefined();
  });

  test('should execute tools and continue loop', async () => {
    // Step 1: LLM decides to call a tool
    mockLLM.chat.mockResolvedValueOnce({
      role: 'assistant',
      tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'London' } } }]
    });

    // Executor returns tool result
    mockExecutor.execute.mockResolvedValueOnce('{"temp":15}');

    // Step 2: LLM provides final answer based on tool result
    mockLLM.chat.mockResolvedValueOnce({
      role: 'assistant',
      content: 'The temperature is 15 degrees.'
    });

    const reply = await orchestrator.run('session_1', 'Whats the weather in London?');

    expect(mockLLM.chat).toHaveBeenCalledTimes(2);
    expect(mockExecutor.execute).toHaveBeenCalledWith('get_weather', { city: 'London' }, { sessionId: 'session_1' });
    expect(reply).toBe('The temperature is 15 degrees.');
    
    // Verify tool result was stored in memory
    const history = memoryManager.getHistoryContext('session_1');
    const toolMessage = history.find(m => m.role === 'tool' && m.name === 'get_weather');
    expect(toolMessage).toBeDefined();
    expect(toolMessage.content).toBe('{"temp":15}');
  });

  test('should abort if maxSteps limit is reached', async () => {
    // LLM keeps calling tools infinitely
    mockLLM.chat.mockResolvedValue({
      role: 'assistant',
      tool_calls: [{ function: { name: 'endless' } }]
    });
    mockExecutor.execute.mockResolvedValue('looping...');

    const reply = await orchestrator.run('session_1', 'start loop');

    // Should stop after 3 iteratons (maxSteps)
    expect(mockLLM.chat).toHaveBeenCalledTimes(3);
    expect(reply).toContain('unable to complete the task within the allowed number of steps');
  });
});
