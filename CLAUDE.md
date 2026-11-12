# CLAUDE.md — KantoLab

## Project Overview
**KantoLab** is a 100% free, zero-backend, browser-based AI agent assembly and testing playground ("The CodePen / DevTools for AI Agents"). Users assemble multiple custom agents by selecting a quantized local model (via WebGPU), writing system prompts, toggling or coding custom tools, and inspecting the live execution loop step-by-step.

## Hard Architectural Rules (DO NOT VIOLATE)
1. **$0 Infrastructure & Zero Backend:** This is a strictly client-side Single-Page Application (SPA) deployed to GitHub Pages / Cloudflare Pages. NEVER introduce Node.js/Express backends, Python servers, Next.js SSR, or paid external databases.
2. **Off-Thread Inference Only:** All `@mlc-ai/web-llm` inference and model loading MUST run inside `src/worker/llm.worker.ts` via WebWorkers so the main React UI thread stays responsive at 60 FPS.
3. **No Heavy Agent Frameworks:** Do NOT install LangChain, CrewAI, or AutoGen. Keep the agent execution loop transparent, deterministic, and written in native TypeScript (`src/core/agent/`) so AI engineers can inspect every step.
4. **Strict Schema Validation:** Every tool input/output must be validated using `zod` and converted to JSON Schema via `zod-to-json-schema`. Never trust raw LLM JSON without `safeParse()`.
5. **Privacy & Local Persistence:** All user documents, custom agent configurations (allowing users to create/save multiple agents), and API keys must stay strictly in browser memory and IndexedDB via `dexie`.

## Tech Stack
- **Build Tool:** Vite (`vite.config.ts` with `worker: { format: 'es' }`)
- **Framework:** React 19 + TypeScript (Strict Mode)
- **Styling:** Tailwind CSS + `lucide-react`
- **Inference:** `@mlc-ai/web-llm` (WebGPU) + optional BYOK provider adapter interface
- **State Management:** `zustand` (governing finite states: `IDLE`, `LOADING_MODEL`, `THINKING`, `EXECUTING_TOOL`, `AWAITING_APPROVAL`, `COMPLETED`, `ERROR`)
- **Client Storage:** `dexie` (IndexedDB wrapper for storing multiple assembled agents and run histories)
- **Search / RAG:** `minisearch` (in-memory BM25 keyword search; no external vector DBs)
- **Validation:** `zod` 4 package, but always import from `zod/v3` (that is the API `zod-to-json-schema` converts) + `zod-to-json-schema`
- **Lint:** `oxlint` (`.oxlintrc.json`)

## Commands
- `npm run dev` — Vite dev server
- `npm test` — Vitest unit tests (`src/**/*.test.ts`)
- `npm run build` — type-check (`tsc -b`) then production build to `dist/`
- `npm run lint` — oxlint
- `npm run preview` — serve the built `dist/`

## Implementation Notes
- **Tool-call protocol:** models reply with one JSON object, `{"tool","args"}` or `{"final"}` (see `src/core/agent/protocol.ts`). Native function calling is not used so small WebLLM models and BYOK providers behave the same.
- **Tools:** define with `defineTool()` and call only through `invokeTool()` (`src/core/tools/types.ts`), which `safeParse`s input and output.
- **Custom JS tools** run in a throwaway Blob worker with a timeout (`src/core/tools/sandbox.ts`).
- **BYOK Anthropic** uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, lazily imported.
- **State machine:** `useAgentStore.transition()` throws on illegal transitions; `src/core/agent/session.ts` is the only place that wires the loop to the store.
- **Streaming:** providers stream when `ChatOptions.onText` is set; the runner forwards it via `RunHooks.onPartial`, and the store keeps it in `stream`.
- **Multi-run jobs:** compare (`src/core/agent/compare.ts`) and test sets (`src/core/evals/`) call `session.startRun()` sequentially and set `store.batch` so the Run tab doesn't start a competing run. Test runs auto-deny tools that ask first.
- **Agents as tools:** `agent:<id>` entries in `toolNames` become `ask_<slug>` tools (`src/core/agent/subagent.ts`). The child runs through the same `runAgent` with `nesting`; its steps carry `depth`/`agent` in the parent trace. Tools receive a `ToolContext` (signal, hooks, depth, ancestors) via `invokeTool`. Cycles and depth > `MAX_AGENT_DEPTH` are dropped at resolve time; a local sub-agent must use the already-loaded WebLLM model (no state transitions mid-run). Agent refs are stripped from shares; `deleteAgent()` removes dangling refs.
- **Templates:** `src/core/agent/templates.ts` — agents reference each other as `@key` in `toolNames` and `{{tool:key}}` in prompts/checks; `buildTemplate()` is pure, `installTemplate()` writes agents + test set + sample docs. All agents get the selected agent's model.
- **Test versions:** each `EvalResult` stores an `AgentSnapshot` (`src/core/evals/versions.ts`); the Tests tab diffs it against the previous run of the same agent. Snapshots are optional (older results lack them).
- **AI grader:** `judge` checks are graded after the run by `gradeAnswer()` (`src/core/evals/judge.ts`) through `session.chatOnce()`; the verdict JSON is zod-validated with one retry. `EvalSet.judgeAgentId` picks the grader (unset = self-grading).
- **Edit & re-run:** `src/core/agent/replay.ts` rebuilds the model's messages from top-level trace steps; `runAgent({ resume })` continues from there (`nextReply` replaces one model call). `session.rerunFrom()` copies earlier steps as `replayed` and saves the new run with `rerunOf`. Runs now store chat `history`.
- **Sharing:** `src/core/agent/share.ts` bundles an agent + its custom tools (never API keys), deflate-raw + base64url into `#agent=`; imports are zod-validated and tool-name clashes are renamed.
- **UI tips:** plain-language copy lives in `src/components/tips/tips.ts`; attach with `<Field tip=…>`, `<SectionTitle tip=…>` or `<InfoTip id=…>`. Keep screens light: details behind ⓘ.
- **Dexie schema:** bump `db.version(n)` for new tables (v2 added `evalSets`); never edit an existing version's stores.
- **Lazy heavy deps:** `@mlc-ai/web-llm` and `@anthropic-ai/sdk` are dynamically imported; keep them out of the initial bundle.

## Directory Structure
```text
kantolab/
├── CLAUDE.md                    # Architectural rules & developer guide
├── public/
│   └── samples/                 # Bundled sample transcripts for instant testing
├── src/
│   ├── components/
│   │   ├── inspector/           # Live DevTools trace viewer, JSON inspector, approval gates
│   │   ├── playground/          # Agent assembler (model picker, prompt editor, tool checkboxes)
│   │   └── ui/                  # Reusable buttons, badges, modals
│   ├── core/
│   │   ├── agent/               # Deterministic while-loop runner & Zustand store
│   │   ├── engine/              # WebLLM bridge, hardware WebGPU profiler, BYOK providers
│   │   ├── memory/              # MiniSearch in-memory indexer & Dexie.js database schema
│   │   └── tools/               # Built-in Zod tools & dynamic custom JS tool sandbox
│   ├── worker/
│   │   └── llm.worker.ts        # Background WebWorker running WebWorkerMLCEngineHandler
│   ├── App.tsx
│   └── main.tsx
└── vite.config.ts
```
