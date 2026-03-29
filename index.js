'use strict';

const { config, validate } = require('./src/config');
const { logger }            = require('./src/utils/logger');
const { OllamaProvider }    = require('./src/llm/ollamaProvider');
const { ToolExecutor }      = require('./src/executor/toolExecutor');
const { registerAll }       = require('./src/tools');
const { AgentOrchestrator } = require('./src/orchestrator/agentOrchestrator');
const { MessageController } = require('./src/controller/messageController');
const { TelegramTransport } = require('./src/transport/telegram');

const { ShortTermMemory }   = require('./src/memory/shortTermMemory');
const { LongTermMemory }    = require('./src/memory/longTermMemory');
const { MemoryManager }     = require('./src/memory/memoryManager');
const { createMemoryTool }  = require('./src/tools/memoryTool');


/**
 * Application entry point.
 * Wires up all layers in dependency order:
 *   Config → LLM → Tools → Executor → Orchestrator → Controller → Transport
 */
async function main() {
  // 1. Validate config
  validate();
  logger.info('[Main] Configuration validated');

  // 2. LLM Provider
  const llmProvider = new OllamaProvider();
  logger.info(`[Main] LLM provider: Ollama @ ${config.ollama.baseUrl} (${config.ollama.model})`);

  // 3. Tool Executor + register all tools
  const toolExecutor = new ToolExecutor({
    timeoutMs: config.tool.timeoutMs,
    maxResponseBytes: config.tool.maxResponseBytes,
  });
  registerAll(toolExecutor);

  // 3.5. Memory Layer
  const shortTerm = new ShortTermMemory();
  const longTerm = new LongTermMemory();
  longTerm.init();
  const memoryManager = new MemoryManager({ shortTerm, longTerm });

  // Register reasoning and memory tools
  const memoryTool = createMemoryTool(longTerm);
  toolExecutor.register(memoryTool.schema.function.name, memoryTool.schema, memoryTool.handler);



  logger.info(`[Main] Tools registered: ${toolExecutor.getSchemas().map(t => t.function.name).join(', ')}`);

  // 4. Agent Orchestrator
  const orchestrator = new AgentOrchestrator({
    llmProvider,
    toolExecutor,
    memoryManager,
  });

  // 5. Message Controller
  const controller = new MessageController({ orchestrator });

  // 6. Telegram Transport
  const transport = new TelegramTransport({ controller });

  // 7. Start
  await transport.start();
  logger.info('[Main] Agent is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  process.once('SIGINT',  () => { longTerm.close(); transport.stop(); process.exit(0); });
  process.once('SIGTERM', () => { longTerm.close(); transport.stop(); process.exit(0); });
}

main().catch((err) => {
  console.error('[Main] Fatal error:', err.message);
  process.exit(1);
});
