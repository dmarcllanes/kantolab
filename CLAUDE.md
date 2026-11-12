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
- **Tool-call protocol:** models reply with one JSON object, `{"tool","args"}` or `{"final"}` (see `src/core/agent/protocol.ts`). Native function calling is not used so small WebLLM models and BYOK providers behave the same. Reasoning models' `<think>…</think>` is removed by `splitThinking()` before parsing and kept as `data.reasoning` on the step (shown as "Model's reasoning").
- **Tools:** define with `defineTool()` and call only through `invokeTool()` (`src/core/tools/types.ts`), which `safeParse`s input and output.
- **Custom JS tools** run in a throwaway Blob worker with a timeout (`src/core/tools/sandbox.ts`).
- **Free cloud providers:** `src/core/engine/cloudProviders.ts` lists free-tier, CORS-checked OpenAI-compatible services (Groq, Gemini, OpenRouter, Cerebras, Mistral, Hugging Face, Cohere). An agent using one is a plain `openai-compatible` agent whose `baseUrl` matches a preset (`presetForBaseUrl`); the editor's provider menu and `ProviderSetup` handle it (key field, "Get a free key" link, live model list from `GET /models`). Keys are stored per server (`serverKeySetting(baseUrl)`), falling back to the old shared `apiKey:openai-compatible` (`savedKeyFor()` in session.ts). Re-check CORS before adding a preset (GitHub Models, SambaNova and NVIDIA block browsers).
- **BYOK Anthropic** uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, lazily imported. No `temperature` (current models reject sampling params); `output_config.effort` and `fallbacks: "default"` only for the models in `EFFORT_MODELS`/`FALLBACK_MODELS`. SDK errors map to plain messages in `anthropicProblem()`. **Test connection** (`session.checkConnection()` → `testConnection()`) checks key/model/URL without generating: Anthropic `models.retrieve`, OpenAI-compatible `GET /models`. Provider tests run the real SDK against an injected `fetch` (`src/core/engine/byok.test.ts`).
- **State machine:** `useAgentStore.transition()` throws on illegal transitions; `src/core/agent/session.ts` is the only place that wires the loop to the store.
- **Streaming:** providers stream when `ChatOptions.onText` is set; the runner forwards it via `RunHooks.onPartial`, and the store keeps it in `stream`.
- **Multi-run jobs:** compare (`src/core/agent/compare.ts`) and test sets (`src/core/evals/`) call `session.startRun()` sequentially and set `store.batch` so the Run tab doesn't start a competing run. Test runs auto-deny tools that ask first.
- **Agents as tools:** `agent:<id>` entries in `toolNames` become `ask_<slug>` tools (`src/core/agent/subagent.ts`). The child runs through the same `runAgent` with `nesting`; its steps carry `depth`/`agent` in the parent trace. Tools receive a `ToolContext` (signal, hooks, depth, ancestors) via `invokeTool`. Cycles and depth > `MAX_AGENT_DEPTH` are dropped at resolve time; a local sub-agent must use the already-loaded WebLLM model (no state transitions mid-run). Agent refs are stripped from shares; `deleteAgent()` removes dangling refs.
- **Templates:** `src/core/agent/templates.ts` — agents reference each other as `@key` in `toolNames` and `{{tool:key}}` in prompts/checks; `buildTemplate()` is pure, `installTemplate()` writes agents + test set + sample docs. All agents get the selected agent's model.
- **Test versions:** each `EvalResult` stores an `AgentSnapshot` (`src/core/evals/versions.ts`); the Tests tab diffs it against the previous run of the same agent. Snapshots are optional (older results lack them).
- **AI grader:** `judge` checks are graded after the run by `gradeAnswer()` (`src/core/evals/judge.ts`) through `session.chatOnce()`; the verdict JSON is zod-validated with one retry. `EvalSet.judgeAgentId` picks the grader (unset = self-grading).
- **Edit & re-run:** `src/core/agent/replay.ts` rebuilds the model's messages from top-level trace steps; `runAgent({ resume })` continues from there (`nextReply` replaces one model call). `session.rerunFrom()` copies earlier steps as `replayed` and saves the new run with `rerunOf`. Runs now store chat `history`.
- **Sharing:** `src/core/agent/share.ts` bundles an agent + its custom tools (never API keys), deflate-raw + base64url into `#agent=`; imports are zod-validated and tool-name clashes are renamed.
- **Privacy consent:** asked on every visit (`src/components/privacy/ConsentDialog.tsx`); choices in `src/core/privacy/consent.ts` (localStorage, pre-fills next visit). Enforced in `session.ts` (`requireConsent()` before any WebLLM load or remote provider), and `profileGpu()` only runs once local AI is allowed. Before an answer, nothing optional is allowed. If you add anything that touches the device or network, add it to the dialog and gate it the same way.
- **Guide mode (beginners):** `src/components/guide/`. Toggle state lives in `useGuide` (localStorage, guarded). `<GuideNote id>` shows panel notes (copy in `notes.ts`), `<StepGuide>` explains each trace card (`explainStep()` in `explain.ts`), `<NextStepBar>` gives the Run panel's next action (`nextStep()`), `<Tour>` spotlights `[data-tour=…]` elements. Everything renders nothing when Guide is off. Explanations are pure functions; add tests when you add cases.
- **Look & theme (Material 3):** colours come from CSS variables in `src/index.css`, which remap Tailwind's palette names to Material roles (zinc = neutral surfaces/text, emerald = primary Google-style blue, sky = info/guide, violet = tools, amber/red = warning/error) for dark (base) and light (`prefers-color-scheme` or `html[data-theme]`). Keep using those palette classes in components so both themes work; don't hard-code hex values. The theme choice is in `src/components/ui/theme.ts` (Settings → Appearance). Roboto and Roboto Mono are bundled via `@fontsource-variable` (no font CDN). Buttons are pills (`Button`), and panels are `rounded-2xl` cards.
- **Progress (gamification):** `src/core/progress/progress.ts` is pure: XP, levels, streaks, achievements and daily quests are all *derived* from data already in Dexie (`collectStats()` in `stats.ts` reads runs, agents, tools, documents, models and test history). No event tracking, nothing sent; deleting data resets progress. Daily quests are picked by local day number, so past days count too. UI in `src/components/progress/`: `LevelChip` (header), `ProgressModal`, `ProgressWatcher` (toasts + CSS confetti). Celebrated ids live in localStorage `kantolab.progress.seen`; the first visit (or while it's off) marks everything seen silently. Off switch: Settings → Progress. To add an achievement, add it to `ACHIEVEMENTS` with a `measure` over `ProgressStats` (extend `collectStats` if needed) and an icon key in `icons.ts`.
- **UI tips:** plain-language copy lives in `src/components/tips/tips.ts`; attach with `<Field tip=…>`, `<SectionTitle tip=…>` or `<InfoTip id=…>`. Keep screens light: details behind ⓘ.
- **Dexie schema:** bump `db.version(n)` for new tables (v2 added `evalSets`, v3 `customModels`); never edit an existing version's stores.
- **Custom models:** `src/core/engine/customModels.ts`. Entries are appended to WebLLM's `appConfig.model_list` in `loadModel()`. Folder imports are written into WebLLM's Cache Storage scopes (`webllm/config|model|wasm`) under `https://models.kantolab.invalid/<id>/resolve/main/`, so WebLLM treats them as already downloaded. Read each file to an ArrayBuffer before `cache.put` (Chrome rejects File bodies). The manifest is stored as `tensor-cache.json` (older exports: `ndarray-cache.json`). GGUF goes through the OpenAI-compatible provider; localhost base URLs need no key.
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
