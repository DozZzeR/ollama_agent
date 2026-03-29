'use strict';

const { AgentOrchestrator } = require('../../../src/orchestrator/agentOrchestrator');
const { MemoryManager } = require('../../../src/memory/memoryManager');
const { ShortTermMemory } = require('../../../src/memory/shortTermMemory');

// Mock child components
jest.mock('../../../src/orchestrator/triage');
jest.mock('../../../src/orchestrator/planner');
jest.mock('../../../src/orchestrator/stepExecutor');
jest.mock('../../../src/orchestrator/evaluator');

const { Triage } = require('../../../src/orchestrator/triage');
const { Planner } = require('../../../src/orchestrator/planner');
const { StepExecutor } = require('../../../src/orchestrator/stepExecutor');
const { Evaluator } = require('../../../src/orchestrator/evaluator');

describe('AgentOrchestrator (State Machine)', () => {
  let orchestrator;
  let mockLLM;
  let mockToolExecutor;
  let memoryManager;
  let mockTriageEvaluate;
  let mockPlannerCreatePlan;
  let mockStepExecutorExecute;
  let mockEvaluatorEvaluate;

  beforeEach(() => {
    memoryManager = new MemoryManager({ shortTerm: new ShortTermMemory(), maxHistoryMessages: 10 });
    
    mockLLM = { chat: jest.fn() };
    mockToolExecutor = { getSchemas: jest.fn().mockReturnValue([]), execute: jest.fn() };

    mockTriageEvaluate = jest.fn().mockResolvedValue('DIRECT');
    mockPlannerCreatePlan = jest.fn();
    mockStepExecutorExecute = jest.fn();
    mockEvaluatorEvaluate = jest.fn();

    Triage.mockImplementation(() => ({ evaluate: mockTriageEvaluate }));
    Planner.mockImplementation(() => ({ createPlan: mockPlannerCreatePlan }));
    StepExecutor.mockImplementation(() => ({ execute: mockStepExecutorExecute }));
    Evaluator.mockImplementation(() => ({ evaluate: mockEvaluatorEvaluate }));
    
    orchestrator = new AgentOrchestrator({
      llmProvider: mockLLM,
      toolExecutor: mockToolExecutor,
      memoryManager,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should handle direct answers bypassing state machine', async () => {
    mockTriageEvaluate.mockResolvedValueOnce('DIRECT');
    mockLLM.chat.mockResolvedValueOnce({ content: 'Direct reply' });

    const reply = await orchestrator.run('session_1', 'hello');
    expect(reply).toBe('Direct reply');
    expect(mockTriageEvaluate).toHaveBeenCalledWith('hello');
  });

  test('should execute state machine pipeline when planned', async () => {
    // 1. Triage says PLAN
    mockTriageEvaluate.mockResolvedValueOnce('PLAN');
    
    // 2. Planner returns a 1-step plan
    mockPlannerCreatePlan.mockResolvedValueOnce({
      goal: 'Find weather',
      steps: [{ id: 's1', title: 'Check weather', status: 'pending', kind: 'tool' }]
    });

    // 3. Executor completes the step
    mockStepExecutorExecute.mockResolvedValueOnce({
      status: 'completed',
      output_summary: 'Weather is 20C',
    });

    // 4. Evaluator says done
    mockEvaluatorEvaluate.mockResolvedValueOnce({ decision: 'done' });

    // 5. Final summary (direct LLM call in Orchestrator)
    mockLLM.chat.mockResolvedValueOnce({ content: 'The weather is 20C.' });

    const reply = await orchestrator.run('session_1', 'Whats the weather in London?');
    
    expect(mockPlannerCreatePlan).toHaveBeenCalled();
    expect(mockStepExecutorExecute).toHaveBeenCalled();
    expect(mockEvaluatorEvaluate).toHaveBeenCalled();
    expect(reply).toBe('The weather is 20C.');
  });
});
