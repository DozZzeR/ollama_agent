# AGENT_PLAN.md

> Detailed implementation plan for the `ollama_agent` project.
> Last updated: 2026-03-29

---

## Phase 1 — Project Skeleton ✅

**Goal**: Folder structure and base classes.

- [x] Config, LLM provider, transport, controller, orchestrator, memory, tools, executor, DB, utils

---

## Phase 2 — Basic Chat Loop ✅

**Goal**: Bot replies to messages via Ollama.

- [x] Messages[] accumulation via MemoryManager
- [x] OllamaProvider.chat(messages, tools, format) — Ollama `/api/chat`
- [x] Wire Telegram → Controller → Orchestrator → LLM → Telegram

---

## Phase 3 — Tool System ✅

**Goal**: Tools registered, executed by backend.

- [x] Tool registry (`src/tools/index.js`)
- [x] `http_fetch` — HTTP GET/POST with URL security
- [x] `get_current_time` — time with timezone
- [x] `remember_fact` — save facts to SQLite (with validation)
- [x] `think_and_plan` — CoT reasoning (created, not registered by default)
- [x] `ToolExecutor` — timeout, size limits, context passing

---

## Phase 4 — TOOL_LOOP Architecture ✅ (was: Multi-step Agent Loop)

**Goal**: Model decides when to use tools. Orchestrator executes tool_calls.

### Architecture: Two modes

| Mode | When | Tools | LLM calls |
|------|------|-------|-----------|
| DIRECT | triage score ≤ 1 | none | 1 |
| TOOL_LOOP | triage score ≥ 2 | all schemas | 1..N (loop on tool_calls) |

### TOOL_LOOP flow
```
1. User message → addToHistory
2. messages[] + tool_schemas → LLM
3. If LLM returns tool_calls → execute → add results → loop (go to 2)
4. If LLM returns content → done (final answer)
5. Max 10 iterations
```

### Key principle
Model decides if/when to call tools via standard Ollama tool_calls API.
Orchestrator executes and returns results. No simulation allowed.

### Tasks completed
- [x] Triage returns `{ decision, score }` — DIRECT (≤1) or TOOL_LOOP (≥2)
- [x] TOOL_LOOP in orchestrator — standard agent loop
- [x] Tool results added to messages[] as role='tool'
- [x] DB logging: triage_score, triage_decision, model_response, tools_called
- [x] Anti-hallucination rules in system prompt
- [x] `/tools` command forces TOOL_LOOP for next message

### Removed (was overkill for MVP)
- Planner (strict JSON plan generation) — files kept, not wired
- StepExecutor (single step execution) — files kept, not wired
- Evaluator (transition decisions) — files kept, not wired

---

## Phase 5 — Memory Layer ✅

**Goal**: Persist conversation history and user facts.

- [x] ShortTermMemory — in-memory per-session messages + preferences
- [x] LongTermMemory — SQLite (user_facts, agent_runs)
- [x] MemoryManager — context assembly, trimming (max 50), facts injection
- [x] Fact validation in memoryTool (anti-hallucination filters)
- [x] RunRepository — createRun, updateRun with triage/response tracking

---

## Phase 6 — Triage (Optimization) ✅

**Goal**: Skip tools for trivial messages as optimization.

- [x] Heuristic keyword scoring (multiIntent, needsTools, artifact, risk)
- [x] score ≤ 1 → DIRECT, score ≥ 2 → TOOL_LOOP
- [x] No MODEL_TRIAGE (removed — unnecessary LLM call)
- [x] `/tools` command overrides to force TOOL_LOOP

---

## Phase 7 — Security, Limits & UX 🔜

- [x] URL blocklist (localhost, private IPs)
- [x] Tool timeout + response size limits
- [ ] Optional domain allowlist
- [ ] POST/PUT confirmation
- [ ] Safe Markdown rendering for Telegram

---

## Phase 8 — Skill System (Future)

- [ ] Skill format (name, system prompt, allowed_tools[])
- [ ] Skill selector
- [ ] Apply skill's prompt + tool filter

---

## Current Architecture

```
src/
├── config/index.js           # env config
├── controller/messageController.js  # input normalization
├── db/runRepository.js       # agent_runs CRUD
├── executor/toolExecutor.js  # safe tool execution
├── llm/
│   ├── llmProvider.js        # abstract interface
│   └── ollamaProvider.js     # Ollama /api/chat
├── memory/
│   ├── shortTermMemory.js    # in-memory per-session
│   ├── longTermMemory.js     # SQLite
│   └── memoryManager.js      # context assembly + system prompts
├── orchestrator/
│   ├── agentOrchestrator.js  # DIRECT + TOOL_LOOP routing
│   ├── triage.js             # heuristic scoring
│   ├── planner.js            # (kept, not wired)
│   ├── stepExecutor.js       # (kept, not wired)
│   └── evaluator.js          # (kept, not wired)
├── tools/
│   ├── index.js              # registry
│   ├── fetchTool.js          # http_fetch
│   ├── timeTool.js           # get_current_time
│   ├── memoryTool.js         # remember_fact
│   └── reasoningTool.js      # think_and_plan (not registered)
├── transport/telegram.js     # Telegraf bot
└── utils/logger.js           # simple logger
```

---

## Principles

- LLM is stateless. Backend controls the loop.
- `messages[]` is the ONLY source of context.
- Tool execution is ALWAYS backend responsibility.
- Model cannot claim tool results without actual tool_calls.
- DIRECT mode: no tools, no JSON, natural language only.
- TOOL_LOOP mode: tools available, model decides, orchestrator executes.
