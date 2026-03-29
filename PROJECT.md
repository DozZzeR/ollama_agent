# PROJECT.md

## Overview

This project defines a modular, extensible AI agent system designed to orchestrate interactions between a user (via Telegram), a local LLM (via Ollama), and external tools (HTTP, APIs, memory, etc.).

The system is not a simple chatbot. It is an **agent orchestrator** that:

* maintains structured conversational context,
* delegates actions via tool calling,
* executes external operations through backend-controlled tools,
* and iteratively reasons toward a final answer.

---

## Goals

### Primary Goals

* Build a Node.js service that:

  * listens to Telegram messages,
  * processes them through a local LLM (Ollama),
  * supports tool calling (HTTP/API/auth/etc.),
  * executes tools via backend,
  * returns structured responses to user.

### Secondary Goals

* Support modular architecture (low coupling).
* Allow replacing:

  * LLM provider,
  * database,
  * transport layer (Telegram → Web).
* Implement short-term and long-term memory.
* Enable agent-like multi-step reasoning.
* Support future skill-based behavior (Claude-style).

---

## Architecture Overview

```
Transport (Telegram)
        ↓
Controller
        ↓
Agent Orchestrator
        ↓
LLM Provider (Ollama)
        ↓
Tool Executor → External APIs
        ↓
Memory Layer
```

---

## Core Components

### 1. Transport Layer

* Telegram Bot API adapter
* Handles:

  * incoming messages
  * commands
  * inline buttons
  * formatted output

### 2. Controller Layer

* Entry point for incoming messages
* Normalizes input
* Passes to orchestrator

### 3. Agent Orchestrator (CORE)

* Maintains message history
* Runs agent loop
* Handles tool calls
* Applies planning step
* Controls execution limits

### 4. LLM Provider

* Abstract interface
* First implementation: Ollama
* Future: OpenAI / Claude / others

### 5. Tool System

* Modular tools:

  * HTTP fetch
  * JSON API
  * auth/login
  * memory access
  * time
* Each tool:

  * has schema
  * is validated
  * is executed by backend

### 6. Tool Executor

* Executes tool calls safely
* Validates input
* Applies ограничения (timeouts, size limits)

### 7. Memory Layer

#### Short-term memory

* recent messages
* tool results
* summarized context

#### Long-term memory

* user facts
* preferences
* learned data

### 8. Skill System (Planned)

* Dynamic prompt modules
* Tool subsets
* Context-aware behavior modes

---

## Agent Execution Model

The system operates as a loop:

1. User message received
2. LLM processes messages[]
3. LLM may request tool calls
4. Backend executes tools
5. Results appended to messages[]
6. Loop continues until final answer

---

## Planning Step

Before execution, the system may optionally:

* ask LLM to produce a plan
* execute plan step-by-step
* improve reasoning quality

---

## Tool Rules

### Allowed

* GET requests (auto)

### Restricted

* POST/PUT → require confirmation
* auth flows → controlled

### Security

* block localhost (except whitelist)
* block internal IP ranges
* optional domain allowlist

---

## Memory Strategy

* Context is NOT infinite
* Must implement:

  * trimming
  * summarization
  * separation of memory types

---

## Constraints

* max steps per request
* max tool response size
* timeout per tool
* rate limiting (future)

---

## Storage

### MVP

* SQLite (via abstraction layer)

### Future

* PostgreSQL
* vector storage (embeddings)

---

## LLM Strategy

### Primary

* Local Ollama model

### Future

* fallback to external API if needed

---

## Developer Notes (IMPORTANT)

* LLM is stateless
* Backend controls loop
* messages[] is the ONLY source of context
* Tool execution is ALWAYS backend responsibility

---

# MVP Implementation Plan

## Step 1 — Project Skeleton

→ see: Architecture / Core Components

* folders structure
* base orchestrator
* LLM provider (Ollama)
* Telegram adapter

---

## Step 2 — Basic Chat Loop

→ see: Agent Execution Model

* messages[]
* single-step response
* no tools yet

---

## Step 3 — Tool Calling

→ see: Tool System

* implement fetch tool
* detect tool_calls
* execute + return

---

## Step 4 — Multi-step Agent Loop

→ see: Agent Execution Model

* loop with max steps
* handle multiple tool calls

---

## Step 5 — Memory Layer

→ see: Memory Strategy

* short-term storage
* basic long-term store

---

## Step 6 — Planning Step

→ see: Planning Step

* optional pre-plan
* structured execution

---

## Step 7 — Security & Limits

→ see: Constraints / Tool Rules

* validation
* rate limiting (basic)
* URL filtering

---

## Step 8 — Skill System (optional MVP+)

→ see: Skill System

* dynamic prompts
* tool routing

---

# Internal Thoughts (Human Notes)

(These are design intentions and reasoning, not strict requirements)

* System must behave as orchestrator, not chatbot
* Avoid overengineering early (queues, microservices)
* Start simple → evolve
* Agent loop is the core abstraction
* Tool calling is controlled RPC, not magic
* Memory must be structured early to avoid rewrite later
* Skills may become dominant abstraction later

---

# Code Generator Instructions

You (Antigravity code generator agent) MUST:

1. Read this file before any action

2. Generate a working plan in:
   → `AGENT_PLAN.md`

3. The plan must:

   * break MVP into tasks
   * reference sections of this document
   * define execution order

4. Then generate:
   → `NEXT_STEPS.md`

5. Each step must:

   * be atomic
   * be executable
   * produce working code

6. After each step:

   * re-evaluate architecture
   * avoid breaking abstractions

7. DO NOT:

   * skip layers
   * hardcode tools into orchestrator
   * mix transport with core logic

---

## Anti-Patterns

* No giant “god service”
* No direct fetch inside LLM layer
* No uncontrolled context growth
* No hidden side effects

---

## Desired Outcome

A modular, extensible AI agent system capable of:

* reasoning,
* acting,
* remembering,
* and evolving.
