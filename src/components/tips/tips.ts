// Plain-language explanations shown behind the ⓘ buttons. Keep each one short:
// what it is, why it matters, what to pick.

export type TipVisualKind = 'temperature' | 'messages' | 'steps' | 'toolcall' | 'states' | 'chunks' | 'timeline'

export interface Tip {
  title: string
  body: string[]
  visual?: TipVisualKind
}

export const TIPS = {
  provider: {
    title: 'Provider',
    body: [
      'Where the model runs.',
      'Local (WebLLM) runs on your own GPU inside this browser tab: free and private, but it downloads the model first and small models are less capable.',
      'Free cloud AI (Groq, Google Gemini, OpenRouter, Cerebras, Mistral, Hugging Face, Cohere) sends each step to that company with a free API key: much smarter models, no download, within their free limits.',
      'Your own server is Ollama or LM Studio on your computer. Anthropic Claude needs a paid key.',
    ],
  },
  model: {
    title: 'Local model',
    body: [
      'The AI model that does the thinking. Bigger models (more “B” = billions of parameters) follow instructions and use tools better, but take longer to download and need more GPU memory.',
      '“q4f16” means the model is compressed to 4-bit numbers so it fits in a browser. Start with Qwen2.5-1.5B; try a 3B model if it ignores tools.',
    ],
  },
  vram: {
    title: 'GPU memory (VRAM)',
    body: [
      'How much graphics memory the model needs while running. If it’s more than your GPU has, loading fails or the tab crashes.',
      'Most laptops handle 2 GB models comfortably; 4 GB+ needs a strong GPU or Apple silicon.',
    ],
  },
  baseUrl: {
    title: 'Base URL',
    body: [
      'The address of an API that speaks the OpenAI “chat completions” format, ending in /v1.',
      'Because there’s no server here, the provider must allow requests straight from a browser (CORS). Groq, OpenRouter and a local Ollama do; OpenAI itself may block it.',
    ],
  },
  systemPrompt: {
    title: 'System prompt',
    body: [
      'Standing instructions the model reads before every conversation: its role, tone and rules.',
      'When tools are enabled, KantoLab adds the tool list and the JSON reply format underneath your text automatically. Open the first step of any trace to see the full prompt.',
    ],
    visual: 'messages',
  },
  maxSteps: {
    title: 'Max steps',
    body: [
      'One step = one reply from the model. A run that uses two tools takes three steps: tool, tool, answer.',
      'The limit stops a confused model from looping forever (and, with a paid API, from running up a bill). 5–10 is plenty for most tasks.',
    ],
    visual: 'steps',
  },
  temperature: {
    title: 'Temperature',
    body: [
      'How adventurous the model is when picking each next word. Low = it nearly always picks the most likely word (consistent, precise). High = less likely words get a real chance (varied, creative, more mistakes).',
      'For agents that call tools, keep it low (0–0.3) so the JSON stays valid. Drag the slider to see the effect:',
    ],
    visual: 'temperature',
  },
  tools: {
    title: 'Tools',
    body: [
      'Abilities the model can’t do on its own, like exact maths or reading your documents. The model asks for a tool by writing JSON; KantoLab checks it against the tool’s schema, runs it, and hands back the result.',
      'Only enable what the agent needs: fewer tools = shorter prompt and fewer wrong picks.',
    ],
    visual: 'toolcall',
  },
  approval: {
    title: 'Asks first',
    body: [
      'Tools with this badge pause the run and wait for you to Approve or Deny. Use it for anything that reaches the outside world or can’t be undone.',
      'If you deny, the model is told and can try another way.',
    ],
  },
  schema: {
    title: 'Schema',
    body: [
      'A JSON Schema is the exact shape of input a tool accepts: field names, types and which are required. It’s shown to the model so it knows how to call the tool.',
      'If the model sends anything else, the call is rejected before the tool runs, and the error is sent back so it can fix it.',
    ],
  },
  customTools: {
    title: 'Custom JS tools',
    body: [
      'Write your own tool in JavaScript. You define the parameters (they become the schema) and the code that runs.',
      'Code runs in a separate, throwaway worker with no network or storage access, and is stopped after the timeout, so a bug can’t freeze the page.',
    ],
  },
  agentTools: {
    title: 'Agents as tools',
    body: [
      'Let this agent hand work to another saved agent. The model sees a tool like ask_researcher(task); calling it runs that agent with its own model, prompt and tools, and its final answer comes back as the result.',
      'The other agent starts fresh: it only sees the task text, not this chat. Its steps appear indented in the trace. Agents can’t call themselves, and nesting stops after 3 levels.',
      'Local agents must share one model (only one fits in GPU memory); mix freely with API agents.',
    ],
  },
  params: {
    title: 'Parameters',
    body: [
      'The inputs your tool takes. Each one becomes a field in the schema the model sees, and arrives in your code as input.<name>.',
      'Give them clear names and descriptions: that’s all the model knows about them.',
    ],
  },
  sandbox: {
    title: 'Tool code',
    body: [
      'This is the body of an async function. `input` holds the validated parameters; whatever you return is sent back to the model (it must be plain JSON data).',
      'You can use await, Math, Date, JSON and string/array methods. fetch, storage and other workers are switched off.',
    ],
  },
  timeout: {
    title: 'Timeout',
    body: ['If the code is still running after this many milliseconds, the worker is killed and the model gets a timeout error.'],
  },
  documents: {
    title: 'Documents',
    body: [
      'Text you give the agent to look things up in. Each document is split into chunks of a few paragraphs, and search_documents returns the best-matching chunks.',
      'Search is keyword-based (BM25): it ranks chunks by how often your words appear, weighted by how rare they are. Use the same words your documents use.',
    ],
    visual: 'chunks',
  },
  status: {
    title: 'Agent status',
    body: ['The agent is always in exactly one of these states. Watching it change is the quickest way to see what a run is doing.'],
    visual: 'states',
  },
  timeline: {
    title: 'Run timeline',
    body: [
      'Where the time went in this run. Each block is one step; its width is how long it took.',
      'Click a block to jump to that step in the trace.',
    ],
    visual: 'timeline',
  },
  trace: {
    title: 'Trace',
    body: [
      'Every step of the run, in order: the full system prompt, your message, each tool call and its result, approvals, errors and the final answer.',
      'Click “data” on any step to see the raw JSON: the model’s exact reply, parsed arguments, timings and validation errors.',
    ],
  },
  history: {
    title: 'History & samples',
    body: [
      'Every run is saved here automatically, in this browser only. Open one to inspect its trace again, or export it as JSON.',
      'Samples are recorded runs you can explore without downloading a model.',
    ],
  },
  byok: {
    title: 'Bring your own key',
    body: [
      'An API key lets KantoLab call a hosted model on your account. It is stored only in this browser and sent only to that provider.',
      'Usage is billed by the provider, not KantoLab. Create a key with a spending limit if you can.',
    ],
  },
  liveReply: {
    title: 'Live reply',
    body: [
      'The model’s reply appears word by word as it is generated, so you can see it working (and spot broken JSON early).',
      'tok/s is the speed: roughly how many words or word-pieces it writes per second. Local models run at 10–60 tok/s depending on your GPU and model size.',
    ],
  },
  chat: {
    title: 'Follow-up chat',
    body: [
      'Each message continues the conversation: the agent sees your earlier questions and its final answers, so you can say “now do the same for 5 people”.',
      'Tool calls from earlier turns are not replayed, to keep the prompt short. Press New chat to start fresh. Long chats make local models slower.',
    ],
  },
  compare: {
    title: 'Compare',
    body: [
      'Send the same question to two agents and see their answers, speed and tool use side by side. Great for trying a bigger model, a different prompt, or a different temperature.',
      'They run one after another. If both are local with different models, the second model has to load first (only one fits in GPU memory).',
    ],
  },
  customModel: {
    title: 'Your own model',
    body: [
      'Quantized your own model, or fine-tuned one? Three free ways to use it here:',
      'MLC format (from mlc_llm convert_weight): pick its folder and it’s copied into this browser, never uploaded. Or host it on a free Hugging Face repo and paste the URL.',
      'GGUF (Q4_K_M and friends): run it with Ollama, LM Studio or llama.cpp on your computer and point the agent at it. No key needed for localhost.',
    ],
  },
  modelLib: {
    title: 'Model library',
    body: [
      'WebGPU needs the model’s compiled code (a .wasm file from mlc_llm compile) besides its weights.',
      'A fine-tune keeps its base model’s architecture, so it can borrow a built-in library: pick the built-in model it was trained from, with the same quantization (e.g. q4f16_1).',
      'A new architecture or a different context size needs its own compiled .wasm.',
    ],
  },
  rerun: {
    title: 'Edit & re-run',
    body: [
      'Change one step of a finished run and continue from there. Edit a model reply to force a different tool call or answer, or edit a tool result to see how the agent copes with other data or an error.',
      'Everything before the step is replayed exactly as it was (no model calls), so you only pay for what comes after. The new run is saved to History next to the original.',
    ],
  },
  grader: {
    title: 'AI grader',
    body: [
      'For answers a word match can’t check (“is it polite?”, “does it cite a source?”), an agent reads the question, the answer and your rubric, and replies pass or fail with a reason.',
      'It runs on your local model or your own API key, so it costs nothing extra here. Its reply is validated like any tool call, and you can open it under each result.',
      'Write rubrics as concrete, checkable points. A grader on a bigger model than the tested agent is more reliable.',
    ],
  },
  versions: {
    title: 'Versions & results',
    body: [
      'Every test run saves the agent’s settings at that moment: model, prompt, tools, temperature and max steps.',
      'Open a row to see what you changed since that agent’s previous run, which cases it fixed or broke, and the prompt diff. ▲/▼ is the change in pass rate, in points.',
      'Small models are random: a few points either way with no changes is normal. “Restore as a new agent” brings back an old version without touching the current one.',
    ],
  },
  tests: {
    title: 'Test sets',
    body: [
      'A list of questions, each with a check that decides pass or fail. Run them all against an agent to get a pass rate, then change the prompt or model and run again to see if it got better.',
      'Checks: the answer contains a word, equals a text exactly, matches a pattern (regex), or the agent used a certain tool. Tools that ask first are denied automatically during tests.',
    ],
  },
  share: {
    title: 'Share an agent',
    body: [
      'The link contains the whole agent, compressed into the part after #, which browsers never send to any server. Your API keys are never included.',
      'Custom tools travel with their code. When you open someone else’s link, KantoLab shows that code before importing so you can check it.',
    ],
  },
} satisfies Record<string, Tip>

export type TipId = keyof typeof TIPS
