# NEXT_STEPS.md

> Atomic, executable steps. Each step produces working code.
> Current phase: **Phase 1 — Project Skeleton**

---

## ✅ Current Step: 1 — Project Skeleton

### Step 1.1 — Create folder structure
```
src/
  config/
  transport/
  controller/
  orchestrator/
  llm/
  tools/
  executor/
  memory/
```

### Step 1.2 — `.env.example`
Defines required environment variables.

### Step 1.3 — `src/config/index.js`
Loads `.env`, exports typed config object.

### Step 1.4 — `src/llm/llmProvider.js`
Abstract base class with `chat(messages)` method.

### Step 1.5 — `src/llm/ollamaProvider.js`
Concrete Ollama implementation using axios.

### Step 1.6 — `src/transport/telegram.js`
Telegraf bot, listens for messages, calls controller.

### Step 1.7 — `src/controller/messageController.js`
Normalizes Telegram input, calls orchestrator.

### Step 1.8 — `src/orchestrator/agentOrchestrator.js`
Stub agent loop: receive message → call LLM → return reply.

### Step 1.9 — `index.js`
Entry point: load config, init all layers, start bot.

---

## 🔜 Next Step: 2 — Basic Chat Loop
*(after Step 1 is complete and tested)*

- Implement real Ollama chat
- Wire Telegram message → LLM → reply

---

## 🔜 Step 3 — Tool Calling
- fetchTool, timeTool
- Tool registry + executor
- Detect & execute tool_calls

---

## 🔜 Step 4 — Multi-step Agent Loop
- while loop with MAX_STEPS
- Multiple tool calls per iteration

---

## 🔜 Step 5 — Memory
- Short-term (in-memory per user)
- Long-term (SQLite)
- Context trimming

---

## Rules
- Each step = working, runnable code
- After each step: review abstractions before continuing
- Do NOT mix layers
