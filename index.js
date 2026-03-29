'use strict';

const { config, validate } = require('./src/config');
const { logger }            = require('./src/utils/logger');
const { OllamaProvider }    = require('./src/llm/ollamaProvider');
const { ToolExecutor }      = require('./src/executor/toolExecutor');
const { AgentOrchestrator } = require('./src/orchestrator/agentOrchestrator');
const { MessageController } = require('./src/controller/messageController');
const { TelegramTransport } = require('./src/transport/telegram');

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

  // 3. Tool Executor (empty registry for now — tools will be registered in Phase 3)
  const toolExecutor = new ToolExecutor({
    timeoutMs: config.tool.timeoutMs,
    maxResponseBytes: config.tool.maxResponseBytes,
  });

  // 4. Agent Orchestrator
  const orchestrator = new AgentOrchestrator({
    llmProvider,
    toolExecutor,
    maxSteps: config.agent.maxSteps,
  });

  // 5. Message Controller
  const controller = new MessageController({ orchestrator });

  // 6. Telegram Transport
  const transport = new TelegramTransport({ controller });

  // 7. Start
  await transport.start();
  logger.info('[Main] Agent is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  process.once('SIGINT',  () => { transport.stop(); process.exit(0); });
  process.once('SIGTERM', () => { transport.stop(); process.exit(0); });
}

main().catch((err) => {
  console.error('[Main] Fatal error:', err.message);
  process.exit(1);
});
