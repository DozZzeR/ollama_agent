const { ToolExecutor } = require('../../../src/executor/toolExecutor');

describe('ToolExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new ToolExecutor({ timeoutMs: 100, maxResponseBytes: 50 });
  });

  test('should register and return schemas', () => {
    executor.register('test_tool', { name: 'test_tool' }, async () => 'ok');
    const schemas = executor.getSchemas();
    
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('test_tool');
  });

  test('should throw error for unknown tool', async () => {
    await expect(executor.execute('unknown')).rejects.toThrow('Unknown tool: "unknown"');
  });

  test('should execute tool and return stringified result', async () => {
    executor.register('test_tool', {}, async (args) => ({ result: args.input * 2 }));
    
    const result = await executor.execute('test_tool', { input: 5 });
    expect(result).toBe('{"result":10}');
  });

  test('should pass context to tool handler', async () => {
    const mockHandler = jest.fn().mockResolvedValue('ok');
    executor.register('ctx_tool', {}, mockHandler);
    
    await executor.execute('ctx_tool', { a: 1 }, { sessionId: 'test_session' });
    
    expect(mockHandler).toHaveBeenCalledWith({ a: 1 }, { sessionId: 'test_session' });
  });

  test('should trigger timeout if tool takes too long', async () => {
    executor.register('slow_tool', {}, async () => {
      return new Promise(resolve => setTimeout(resolve, 200));
    });
    
    // Executor timeout is 100ms
    await expect(executor.execute('slow_tool', {})).rejects.toThrow(/timed out/);
  });

  test('should truncate long responses exceeding maxResponseBytes', async () => {
    executor.register('verbose_tool', {}, async () => 'A'.repeat(100)); // 100 bytes, limit is 50
    
    const result = await executor.execute('verbose_tool', {});
    expect(result.length).toBeLessThan(100);
    expect(result).toContain('[...truncated]');
    expect(result.startsWith('A'.repeat(50))).toBe(true);
  });
});
