# KantoLab

A free, zero-backend playground for assembling, running and inspecting AI agents — entirely in the browser.

- **Local models via WebGPU** ([WebLLM](https://github.com/mlc-ai/web-llm)), running in a Web Worker so the UI stays smooth.
- **Bring your own key** for Anthropic or any OpenAI-compatible API (Groq, OpenRouter, Ollama…). Keys stay in your browser.
- **Transparent agent loop** in plain TypeScript (`src/core/agent/runner.ts`) — every model reply, tool call, validation error and approval is recorded in the trace.
- **Tools**: calculator, current time, document search (BM25 over your uploaded text), `fetch_url` behind an approval gate, and custom tools you write in JavaScript (sandboxed worker).
- **Agents as tools**: enable another saved agent as a tool (`ask_<name>`); it runs its own loop and its steps show up nested in the trace.
- **Live streaming** of every reply, with a tokens-per-second readout.
- **Follow-up chat**: messages continue the conversation until you press New chat.
- **Compare** two agents on the same question: answers, timing and tool use side by side.
- **Test sets**: questions with checks (contains / equals / regex / uses tool) run in one go for a pass rate, with history.
- **Share agents** as a link (compressed into the URL `#fragment`, never sent to a server) or a file; custom tool code is shown for review before import.
- **Built-in explanations**: every setting has an ⓘ tip, some with interactive visuals (e.g. a temperature demo).
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
