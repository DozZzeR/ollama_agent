# AGENT_PLAN.md

> Detailed implementation plan for the `ollama_agent` project.
> References: PROJECT.md sections are cited inline.

---

## Phase 1 — Project Skeleton
*Ref: PROJECT.md → Step 1 / Core Components*

**Goal**: Create working folder structure and base classes. No logic yet, just interfaces.

### Tasks
- [ ] 1.1 Create folder structure (`src/transport`, `src/controller`, `src/orchestrator`, `src/llm`, `src/tools`, `src/executor`, `src/memory`, `src/config`)
- [ ] 1.2 Create `src/config/index.js` — load `.env`, export config object
- [ ] 1.3 Create `src/llm/llmProvider.js` — abstract LLM interface (base class)
- [ ] 1.4 Create `src/llm/ollamaProvider.js` — Ollama implementation (axios POST to Ollama API)
- [ ] 1.5 Create `src/transport/telegram.js` — Telegraf bot setup, forwards messages to controller
- [ ] 1.6 Create `src/controller/messageController.js` — normalize input, call orchestrator
- [ ] 1.7 Create `src/orchestrator/agentOrchestrator.js` — stub agent loop (messages[], call LLM, return)
- [ ] 1.8 Create `index.js` — entry point, wire up all layers
- [ ] 1.9 Create `.env.example`

---

## Phase 2 — Basic Chat Loop
*Ref: PROJECT.md → Step 2 / Agent Execution Model*

**Goal**: Bot replies to messages via Ollama. Single-step, no tools.

### Tasks
- [ ] 2.1 Implement `messages[]` accumulation in orchestrator
- [ ] 2.2 Implement `ollamaProvider.chat(messages)` — real API call
- [ ] 2.3 Implement `agentOrchestrator.run(userMessage)` — adds user message, calls LLM, returns reply
- [ ] 2.4 Wire reply back to Telegram
- [ ] 2.5 Test: send message → get LLM response in Telegram

---

## Phase 3 — Tool Calling
*Ref: PROJECT.md → Step 3 / Tool System*

**Goal**: LLM can call tools. Backend executes them, returns result to LLM.

### Tasks
- [ ] 3.1 Create `src/tools/index.js` — tool registry (name → handler)
- [ ] 3.2 Create `src/tools/fetchTool.js` — HTTP GET tool with schema
- [ ] 3.3 Create `src/tools/timeTool.js` — current time tool
- [ ] 3.4 Create `src/executor/toolExecutor.js` — validate + execute tool by name
- [ ] 3.5 Modify orchestrator — detect `tool_calls` in LLM response
- [ ] 3.6 Append tool results to `messages[]` and continue loop

---

## Phase 4 — Multi-step Agent Loop
*Ref: PROJECT.md → Step 4 / Agent Execution Model*

**Goal**: Agent can reason over multiple steps with tool calls.

### Tasks
- [ ] 4.1 Implement loop: `while (not final answer && steps < MAX_STEPS)`
- [ ] 4.2 Handle multiple tool calls per step
- [ ] 4.3 Add `MAX_STEPS` config (default: 10)
- [ ] 4.4 Add step logging

---

## Phase 5 — Memory Layer
*Ref: PROJECT.md → Step 5 / Memory Strategy*

**Goal**: Persist conversation history. Basic long-term facts storage.

### Tasks
- [ ] 5.1 Create `src/memory/shortTermMemory.js` — in-memory store, per-user `messages[]`
- [ ] 5.2 Create `src/memory/longTermMemory.js` — SQLite store (user facts, preferences)
- [ ] 5.3 Create `src/memory/memoryManager.js` — coordinator; trim context if too long
- [ ] 5.4 Integrate memoryManager into orchestrator
- [ ] 5.5 Implement context trimming / summarization trigger

---

## Phase 6 — Planning Step
*Ref: PROJECT.md → Step 6 / Planning Step*

**Goal**: Before acting, agent produces a plan. Improves reasoning quality.

### Tasks
- [ ] 6.1 Add optional `planning` mode flag in config
- [ ] 6.2 Before main loop: send "planning prompt" to LLM, receive plan
- [ ] 6.3 Append plan to `messages[]` as system context
- [ ] 6.4 Execute main loop as usual

---

## Phase 7 — Security & Limits
*Ref: PROJECT.md → Step 7 / Constraints / Tool Rules*

**Goal**: Safe tool execution. URL filtering, timeouts, size limits.

### Tasks
- [ ] 7.1 URL blocklist: block localhost, private IP ranges
- [ ] 7.2 Optional domain allowlist
- [ ] 7.3 Add timeout per tool call (config: `TOOL_TIMEOUT_MS`)
- [ ] 7.4 Add max response size limit (`TOOL_MAX_RESPONSE_BYTES`)
- [ ] 7.5 POST/PUT require confirmation (flag or whitelist)

---

## Phase 8 — Skill System (MVP+)
*Ref: PROJECT.md → Step 8 / Skill System*

**Goal**: Dynamic behavior modes via prompt modules and tool subsets.

### Tasks
- [ ] 8.1 Define skill format (name, system prompt, allowed_tools[])
- [ ] 8.2 Create `src/skills/` directory with example skills
- [ ] 8.3 Skill selector — pick skill based on user context
- [ ] 8.4 Apply skill's system prompt + tool filter in orchestrator

---

## Principles (from PROJECT.md → Developer Notes)

- LLM is stateless. Backend controls the loop.
- `messages[]` is the ONLY source of context
- Tool execution is ALWAYS backend (executor) responsibility
- No giant god-service. No direct fetch inside LLM layer.
- No uncontrolled context growth.
