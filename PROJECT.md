# PROJECT.md

## Overview

Modular AI agent system: Telegram + Ollama + Tools.

Not a simple chatbot — an **agent orchestrator** that:
* maintains conversational context
* provides tools to the LLM via standard tool_calls API
* executes tools on backend
* controls execution limits and validates responses

### Two Operating Modes

| Mode | Trigger | Tools | Description |
|------|---------|-------|-------------|
| DIRECT | triage score ≤ 1 | none | Simple chatbot for trivial messages |
| TOOL_LOOP | triage score ≥ 2 | all | Agent with tools, model decides when to use them |

---

## Architecture

```
Transport (Telegram)         src/transport/telegram.js
        ↓
Controller                   src/controller/messageController.js
        ↓
Agent Orchestrator           src/orchestrator/agentOrchestrator.js
   ├── Triage (scoring)      src/orchestrator/triage.js
   ├── DIRECT path           → LLM(no tools) → text
   └── TOOL_LOOP path        → LLM(tools) → [tool_calls → execute →]* → text
        ↓
LLM Provider (Ollama)        src/llm/ollamaProvider.js
        ↓
Tool Executor                src/executor/toolExecutor.js
   ├── http_fetch            src/tools/fetchTool.js
   ├── get_current_time      src/tools/timeTool.js
   └── remember_fact         src/tools/memoryTool.js
        ↓
Memory Layer                 src/memory/
   ├── ShortTermMemory       (in-memory per-session)
   ├── LongTermMemory        (SQLite)
   └── MemoryManager         (context assembly + prompts)
```

---

## Core Components

### Transport Layer
Telegraf bot. Commands: `/start`, `/reset`, `/tools`. Chat ID allowlist.

### Controller
Normalizes input to `{ sessionId, text, onEvent }`. Delegates to orchestrator.

### Orchestrator (CORE)
Two paths:
- **DIRECT**: `addMessage → getHistory(no tools) → llm.chat([], []) → return`
- **TOOL_LOOP**: `addMessage → getHistory(tools) → llm.chat(messages, schemas) → execute tool_calls → loop`

### Triage
Heuristic keyword scoring. Optimization, not a gate.
`/tools` command forces TOOL_LOOP regardless of score.

### LLM Provider
Abstract `LLMProvider` base class. `OllamaProvider` using `/api/chat`.
Supports `messages`, `tools`, `format` parameters.

### Tool System
Tools expose `{ schema, handler }`. Registered in ToolExecutor.
Schemas passed to LLM. Handlers executed by backend.

### Memory
- **ShortTermMemory**: in-memory per-session messages + preferences
- **LongTermMemory**: SQLite (user_facts, agent_runs)
- **MemoryManager**: assembles context (system prompt + facts + history)

---

## Key Design Decisions

### Model decides tool usage
The model receives tool schemas and decides via standard Ollama `tool_calls`.
This replaces a hardcoded keyword-based gate that couldn't cover all cases.

### Anti-hallucination
System prompt explicitly forbids claiming tool results without actual calls.
Fact validation blocks meta-instructions and garbage from being saved.

### Language matching
System prompt starts with CRITICAL RULE about responding in user's language.
Applied to both DIRECT and TOOL_LOOP modes.

---

## Constraints

* Max tool loop iterations: 10
* Max history messages: 50
* Tool timeout: 10s (configurable)
* Tool response max: 32KB (configurable)
* LLM timeout: 60s (configurable)
* Fact length: 5-200 chars, blocked patterns

---

## Developer Notes

* LLM is stateless. Backend controls the loop.
* messages[] is the ONLY source of context.
* Tool execution is ALWAYS backend responsibility.
* If model didn't call a tool → it doesn't have that data.
* DIRECT mode = no tools in prompt, no tools in API.
* TOOL_LOOP mode = tools in prompt AND in API.
