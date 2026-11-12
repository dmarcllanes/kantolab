# KantoLab

A free, zero-backend playground for assembling, running and inspecting AI agents — entirely in the browser.

- **Local models via WebGPU** ([WebLLM](https://github.com/mlc-ai/web-llm)), running in a Web Worker so the UI stays smooth.
- **Your own quantized models**: add an MLC-format model from a folder on your computer (copied into browser storage, never uploaded) or from a URL such as a free Hugging Face repo; fine-tunes can reuse a built-in model's compiled library. GGUF models run through Ollama, LM Studio or llama.cpp on localhost, with no key needed.
- **Bring your own key** for Anthropic or any OpenAI-compatible API (Groq, OpenRouter, Ollama…). Keys stay in your browser.
- **Transparent agent loop** in plain TypeScript (`src/core/agent/runner.ts`) — every model reply, tool call, validation error and approval is recorded in the trace.
- **Tools**: calculator, current time, document search (BM25 over your uploaded text), `fetch_url` behind an approval gate, and custom tools you write in JavaScript (sandboxed worker).
- **Agents as tools**: enable another saved agent as a tool (`ask_<name>`); it runs its own loop and its steps show up nested in the trace.
- **Templates**: one click adds a ready-made multi-agent setup (router + specialists, researcher + writer, draft + critic) with a matching test set.
- **Live streaming** of every reply, with a tokens-per-second readout.
- **Follow-up chat**: messages continue the conversation until you press New chat.
- **Compare** two agents on the same question: answers, timing and tool use side by side.
- **Edit & re-run**: change any model reply or tool result in a finished trace and continue the run from that step; earlier steps are replayed without model calls.
- **Test sets**: questions with checks (contains / equals / regex / uses tool / AI grader with your rubric) run in one go for a pass rate. Every run saves the agent's settings, so the history shows the pass-rate change, which cases were fixed or broken, and a prompt diff; any version can be restored as a new agent.
- **Share agents** as a link (compressed into the URL `#fragment`, never sent to a server) or a file; custom tool code is shown for review before import.
- **Built-in explanations**: every setting has an ⓘ tip, some with interactive visuals (e.g. a temperature demo).
- **Guide mode for beginners**: one toggle in the header adds a short tour, a “what to do next” bar, plain-language notes on each panel, and an explanation under every step of a run (what the model did, what a tool returned, why an error happened and how to fix it).
- **Privacy choices on every visit**: an interactive dialog shows where data can go and lets you check, live, what KantoLab can read (GPU, storage, saved keys). Local AI (GPU + model downloads), API providers and persistent storage are each opt-in and actually enforced.
- **Material 3 look**: light and dark themes (follows your system, or choose in Settings), Roboto bundled locally.
- **Level up as you learn**: XP, levels, daily quests, streaks and achievements, worked out from your own local history (switch off in Settings).
- **Free cloud AI**: pick Groq, Google Gemini, OpenRouter, Cerebras, Mistral, Hugging Face or Cohere, paste a free key, and go. Each provider keeps its own key; the model list loads from your account.
- **All data local**: agents, run history, documents, test sets and keys live in IndexedDB.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests for the loop, protocol, tools and search
npm run lint
npm run build     # static site in dist/
```

Local models need a WebGPU browser (recent Chrome / Edge; Safari 26+). The first run downloads the model (≈1 GB for the default Qwen2.5-1.5B), then it's cached.

## Deploy

Push to `main` with GitHub Pages set to **GitHub Actions** as the source (`.github/workflows/deploy.yml`). The build uses a relative base path, so it also works on Cloudflare Pages with `npm run build` and output directory `dist`.

## How the agent loop works

Small local models don't reliably support native function calling, so every provider gets the same JSON contract appended to the system prompt: reply with `{"tool": ..., "args": ...}` or `{"final": ...}`. Each reply is parsed and validated with zod; malformed replies get a correction message (up to two in a row), tool arguments and results are `safeParse`d, and tools marked "asks first" pause in `AWAITING_APPROVAL` until you approve or deny.
