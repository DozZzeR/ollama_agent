const { ShortTermMemory } = require('../../../src/memory/shortTermMemory');

describe('ShortTermMemory', () => {
  let memory;

  beforeEach(() => {
    memory = new ShortTermMemory();
  });

  test('should return empty array for new session', () => {
    const history = memory.getHistory('session_1');
    expect(history).toEqual([]);
  });

  test('should add messages and retrieve them', () => {
    memory.addMessage('session_1', { role: 'user', content: 'hello' });
    const history = memory.getHistory('session_1');
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual({ role: 'user', content: 'hello' });
  });

  test('should clear history for a session', () => {
    memory.addMessage('session_1', { role: 'user', content: 'hello' });
    memory.clearHistory('session_1');
    const history = memory.getHistory('session_1');
    expect(history).toEqual([]);
  });

  test('should keep sessions separate', () => {
    memory.addMessage('session_1', { role: 'user', content: 's1' });
    memory.addMessage('session_2', { role: 'user', content: 's2' });

    expect(memory.getHistory('session_1')[0].content).toBe('s1');
    expect(memory.getHistory('session_2')[0].content).toBe('s2');
  });

  test('should add multiple messages at once', () => {
    memory.addMessages('session_1', [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
    ]);
    expect(memory.getHistory('session_1')).toHaveLength(2);
  });
});
