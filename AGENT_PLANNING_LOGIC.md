# AGENT RUNTIME SPEC

> Defines the agent runtime rules, modes, and contracts.
> Last updated: 2026-03-29

---

## 0. PURPOSE

Minimal but stable agent runtime where:
* orchestrator controls execution
* model decides WHEN to use tools (via standard tool_calls)
* orchestrator controls HOW tools are executed
* no hallucinated tool results

---

## 1. TWO MODES

### DIRECT (score ≤ 1)
- Simple chatbot. No tools. One LLM call.
- For: greetings, acknowledgments, simple questions from memory.
- System prompt: forbids JSON, tool mentions, function calls.

### TOOL_LOOP (score ≥ 2)
- Agent with tools. Model gets tool schemas, decides what to call.
- For: anything that might need external data or actions.
- System prompt: explicit rules against hallucinating tool results.

```
DIRECT:     user → LLM(no tools) → text response
TOOL_LOOP:  user → LLM(tools) → [tool_calls → execute → results →]* → text response
```

---

## 2. TRIAGE (HEURISTIC SCORING)

Optimization to skip tools for trivial messages. NOT a gate.

```
score = 0
if longText (>200 chars) → +1
if multiIntent markers   → +2
if needsTools markers     → +2
if artifact markers       → +1
if dependentSteps         → +2
if highRisk markers       → +1

score ≤ 1 → DIRECT
score ≥ 2 → TOOL_LOOP
```

`/tools` command forces TOOL_LOOP regardless of score.

---

## 3. TOOL_LOOP FLOW

```
1. addMessage(user message)
2. messages = buildContext(sessionId, { includeToolHints: true })
3. response = llm.chat(messages, toolSchemas)
4. IF response.tool_calls:
     FOR each tool_call:
       result = toolExecutor.execute(name, args, { sessionId })
       addMessage({ role: 'tool', content: result })
     GOTO 3
   IF response.content:
     addMessage(response)
     RETURN response.content
5. Max 10 iterations → fail
```

---

## 4. NON-NEGOTIABLE RULES

### ❌ FORBIDDEN
* model claiming tool results without actual tool_calls
* simulating API responses
* hallucinating URLs, dates, or data not in tool output
* exposing tool schemas in DIRECT mode
* mixing languages in response (must match user's language)

### ✅ REQUIRED
* tool execution ALWAYS by backend (toolExecutor)
* tool errors returned explicitly to model
* all runs logged to DB with triage decision and response
* system prompt enforces language matching
* fact validation before saving to long-term memory

---

## 5. SYSTEM PROMPTS

### DIRECT mode
```
CRITICAL RULE: Respond in the SAME language the user uses.
You are a friendly and helpful AI assistant.
Do NOT output JSON, function calls, or tool invocations.
```

### TOOL_LOOP mode
```
CRITICAL RULE: Respond in the SAME language the user uses.
You are a helpful AI assistant with access to tools.
TOOL USAGE RULES:
- If you need external data — call the appropriate tool.
- NEVER simulate or invent tool results.
- NEVER say "I found" unless you actually received a tool result.
- If no tool can help — say so honestly.
```

---

## 6. DATABASE SCHEMA

### agent_runs
```
id              INTEGER PRIMARY KEY
session_id      TEXT NOT NULL
user_message    TEXT
state           TEXT DEFAULT 'NEW'
triage_score    INTEGER DEFAULT 0
triage_decision TEXT
model_response  TEXT
tools_called    TEXT (JSON array or null)
created_at      DATETIME
updated_at      DATETIME
```

### user_facts
```
id          INTEGER PRIMARY KEY
session_id  TEXT NOT NULL
fact        TEXT NOT NULL
created_at  DATETIME
```

---

## 7. REGISTERED TOOLS

| Tool | Description |
|------|-------------|
| `http_fetch` | HTTP GET/POST to public URLs |
| `get_current_time` | Current date/time with timezone |
| `remember_fact` | Save validated fact to SQLite |

---

## 8. HARD LIMITS

* max tool loop iterations = 10
* tool timeout = configurable (`TOOL_TIMEOUT_MS`, default 10s)
* tool response max size = configurable (`TOOL_MAX_RESPONSE_BYTES`, default 32KB)
* LLM timeout = configurable (`OLLAMA_TIMEOUT_MS`, default 60s)
* max history messages = 50 (trimmed oldest-first)
* fact validation: min 5 chars, max 200 chars, blocked patterns

---

## 9. ERROR HANDLING

* Tool error → explicit `[Tool Error] name failed: message` in messages[]
* LLM timeout → FAILED state
* Empty response → warning + fallback message
* Max iterations → FAILED with user-facing message

---

## 10. FINAL PRINCIPLE

* Model PROPOSES (tool calls, responses)
* Orchestrator EXECUTES (tools) and VALIDATES (facts)
* Messages[] is the SINGLE SOURCE OF TRUTH
* If model didn't call a tool → it doesn't have that data
* Any "I found/fetched" without tool_call = BUG

---

## END
