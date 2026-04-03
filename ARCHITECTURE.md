# Manus AI Platform Architecture

## 1. System Overview
The Manus AI Platform is a fully autonomous, multi-project AI software engineer. It takes high-level goals, breaks them down, and executes them in a sandboxed environment using a strict iterative loop (PLAN → CREATE → EXECUTE → OBSERVE → FIX → REPEAT).

## 2. File Structure
```text
/
├── ARCHITECTURE.md          # This document
├── package.json             # Project dependencies
├── server.ts                # Express backend entry point
├── src/
│   ├── server/              # Backend Modules
│   │   ├── db.ts            # SQLite database layer (Projects, Files, Messages)
│   │   ├── llm.ts           # Multi-LLM routing (Gemini, Anthropic, DeepSeek, HF)
│   │   ├── sandbox.ts       # Safe execution environment (File I/O, Command execution)
│   │   └── orchestrator.ts  # The core iterative loop logic
│   ├── components/          # React UI Components
│   │   ├── Dashboard.tsx    # Project management
│   │   └── Workspace.tsx    # Active project view (Chat, Terminal, Code)
│   ├── App.tsx              # Main React application
│   └── main.tsx             # React entry point
```

## 3. Core Modules & Roles

### A. Database Layer (`db.ts`)
Maintains persistent state using SQLite.
- **Projects Table:** Stores app goals, status, and metadata.
- **Files Table:** Stores the virtual file system for each project, allowing multiple apps to exist in isolation.
- **Messages Table:** Stores the history of the AI's thoughts, actions, and user prompts.

### B. LLM Router (`llm.ts`)
Abstracts the AI provider. Currently implements Gemini, with structured interfaces ready for Anthropic (Claude), DeepSeek, and HuggingFace. It handles tool binding and system prompts.

### C. Sandbox Environment (`sandbox.ts`)
Ensures safety.
- **File Operations:** Scoped strictly to the project's virtual directory in the database.
- **Command Execution:** Uses a whitelist/blacklist approach to prevent destructive commands (e.g., blocks `rm -rf /`). Simulates execution where real execution is too dangerous.

### D. Orchestrator (`orchestrator.ts`)
The brain of the platform. Implements the loop:
1. **PLAN:** Analyze user request and current project state.
2. **CREATE/EXECUTE:** Call tools (write_file, run_command).
3. **OBSERVE:** Capture tool outputs (stdout/stderr or file read results).
4. **FIX:** If a command fails, feed the error back into the LLM for correction.
5. **REPEAT:** Continue until the LLM signals completion.

## 4. Deployment Plan
- **Environment:** Node.js environment (e.g., Google Cloud Run, Docker, or local VPS).
- **Dependencies:** Express (API), SQLite (State), React/Vite (Frontend).
- **Security:** API keys are managed via `.env` variables. The sandbox prevents the AI from accessing the host system's root files.

## 5. Execution Loop Logic
The frontend sends a prompt to `/api/projects/:id/chat`. The server initializes the `Orchestrator`, which starts a `while` loop. In each iteration, it queries the LLM. If the LLM returns tool calls, the Orchestrator executes them via the `Sandbox`, saves the results to the `DB`, and sends the results back to the LLM. This streams to the frontend via Server-Sent Events (SSE).
