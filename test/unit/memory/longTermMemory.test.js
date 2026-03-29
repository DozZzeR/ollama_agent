const { LongTermMemory } = require('../../../src/memory/longTermMemory');

describe('LongTermMemory', () => {
  let memory;

  beforeEach(() => {
    // using in-memory database, so no files are created!
    memory = new LongTermMemory({ dbPath: ':memory:' });
    memory.init();
  });

  afterEach(() => {
    memory.close();
  });

  test('should start with no facts for a session', () => {
    const facts = memory.getFacts('session_1');
    expect(facts).toEqual([]);
  });

  test('should save and retrieve a fact', () => {
    memory.saveFact('session_1', 'user likes coffee');
    
    const facts = memory.getFacts('session_1');
    expect(facts).toHaveLength(1);
    expect(facts[0]).toBe('user likes coffee');
  });

  test('should handle multiple facts and order them', () => {
    memory.saveFact('session_1', 'fact 1');
    memory.saveFact('session_1', 'fact 2');
    
    const facts = memory.getFacts('session_1');
    expect(facts).toHaveLength(2);
    expect(facts).toEqual(['fact 1', 'fact 2']);
  });

  test('should keep sessions isolated', () => {
    memory.saveFact('session_1', 'fact s1');
    memory.saveFact('session_2', 'fact s2');
    
    expect(memory.getFacts('session_1')).toEqual(['fact s1']);
    expect(memory.getFacts('session_2')).toEqual(['fact s2']);
  });
});
