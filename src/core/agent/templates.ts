// Ready-made multi-agent setups. Installing one creates real, editable agents
// (wired together as tools), plus a matching test set and any sample documents.
// Everything is written to IndexedDB; nothing is fetched.
import type { Check, EvalSet } from '../evals/types'
import { newEvalSet } from '../evals/checks'
import { db } from '../memory/db'
import { addDocument } from '../memory/documents'
import { newAgent } from './agents'
import { agentRef, agentToolName } from './subagent'
import type { AgentConfig } from './types'

interface TemplateAgent {
  /** Local key; other agents reference it as "@key" in toolNames and {{tool:key}} in prompts. */
  key: string
  name: string
  systemPrompt: string
  toolNames: string[]
  maxSteps?: number
  temperature?: number
}

export interface AgentTemplate {
  id: string
  name: string
  description: string
  /** Key of the agent you talk to. */
  entry: string
  agents: TemplateAgent[]
  tests?: { name: string; cases: { input: string; check: Check }[] }
  documents?: { title: string; text: string }[]
}

const KANTOLAB_FAQ = `KantoLab FAQ

What is KantoLab? KantoLab is a free playground for building and testing AI agents in the browser. There is no server: agents, documents, test sets and API keys are stored in the browser's IndexedDB.

Which models can I use? Local models run on your GPU through WebLLM and WebGPU; the default is Qwen2.5-1.5B. You can also bring your own key for Anthropic or any OpenAI-compatible API such as Groq, OpenRouter or Ollama.

How does document search work? Uploaded documents are indexed in memory with MiniSearch, which ranks passages with BM25 keyword scoring. There is no vector database and no embeddings.

How do tools work? The model replies with a JSON object naming a tool and its arguments. KantoLab validates the arguments with zod before running the tool, and validates the result afterwards.

Can agents call other agents? Yes. Any saved agent can be enabled as a tool on another agent. Its steps appear indented in the trace. Nesting stops after three levels.

What does it cost? Nothing. KantoLab is a static site; local models are free and API usage is billed by your own provider.`

export const TEMPLATES: AgentTemplate[] = [
  {
    id: 'router',
    name: 'Router + specialists',
    description: 'A router reads each question and hands it to a math or a clock specialist, each with one tool. Shows delegation in its simplest form.',
    entry: 'router',
    agents: [
      {
        key: 'router',
        name: 'Router',
        systemPrompt:
          'You route questions to specialists. For any arithmetic or numbers, call {{tool:math}}. For dates, days or times, call {{tool:clock}}. Pass the whole question as the task. Then give the specialist’s answer in one short sentence. Answer greetings yourself.',
        toolNames: ['@math', '@clock'],
        maxSteps: 6,
      },
      {
        key: 'math',
        name: 'Math specialist',
        systemPrompt: 'You solve arithmetic. Always use the calculator, never compute in your head. Reply with just the result and a few words.',
        toolNames: ['calculator'],
      },
      {
        key: 'clock',
        name: 'Clock',
        systemPrompt: 'You answer questions about the current date, day and time. Always call current_time first. Keep answers to one sentence.',
        toolNames: ['current_time'],
      },
    ],
    tests: {
      name: 'Router checks',
      cases: [
        { input: 'What is 17 * 23?', check: { kind: 'contains', value: '391' } },
        { input: 'What is 1234 * 5678?', check: { kind: 'tool_used', value: 'calculator' } },
        { input: 'What day of the week is it?', check: { kind: 'tool_used', value: 'current_time' } },
        { input: 'Is 2^10 bigger than 1000?', check: { kind: 'tool_used', value: 'calculator' } },
      ],
    },
  },
  {
    id: 'research-writer',
    name: 'Researcher + writer',
    description: 'A writer asks a researcher to search your documents, then writes a short answer that names its sources. Adds a sample FAQ document.',
    entry: 'writer',
    agents: [
      {
        key: 'writer',
        name: 'Writer',
        systemPrompt:
          'You answer questions about the user’s documents. First call {{tool:researcher}} with the question as the task. Then write a clear answer of two or three sentences using only what the researcher found, and end with "Source: <document title>". If nothing was found, say so.',
        toolNames: ['@researcher'],
        maxSteps: 6,
      },
      {
        key: 'researcher',
        name: 'Researcher',
        systemPrompt:
          'You find facts in the user’s documents. Call search_documents with a few keywords from the task (try a second search with other words if the first finds nothing). Reply with the relevant facts as short bullet points, each followed by the document title in brackets. Never invent facts.',
        toolNames: ['search_documents'],
      },
    ],
    documents: [{ title: 'KantoLab FAQ', text: KANTOLAB_FAQ }],
    tests: {
      name: 'Research checks',
      cases: [
        { input: 'How does KantoLab rank document search results?', check: { kind: 'contains', value: 'BM25' } },
        { input: 'Where does KantoLab store my agents?', check: { kind: 'contains', value: 'IndexedDB' } },
        { input: 'What is the default local model?', check: { kind: 'tool_used', value: 'search_documents' } },
        { input: 'Can an agent call another agent?', check: { kind: 'judge', value: 'Says yes, and mentions that the called agent’s steps show in the trace or that nesting is limited. Names a source.' } },
      ],
    },
  },
  {
    id: 'draft-critic',
    name: 'Draft + critic',
    description: 'An author writes a draft, asks a critic for feedback, then revises. A simple self-review loop with no tools besides the critic.',
    entry: 'author',
    agents: [
      {
        key: 'author',
        name: 'Author',
        systemPrompt:
          'You write short, clear texts (under 120 words). First write a draft in your head, then call {{tool:critic}} with the task "Review this draft for: <request>" followed by the full draft. Apply the critic’s points and give only the improved text as your final answer.',
        toolNames: ['@critic'],
        maxSteps: 5,
        temperature: 0.5,
      },
      {
        key: 'critic',
        name: 'Critic',
        systemPrompt:
          'You review drafts. Reply with at most three short, specific suggestions (clarity, missing facts, tone). Do not rewrite the draft yourself.',
        toolNames: [],
        temperature: 0.3,
      },
    ],
    tests: {
      name: 'Draft checks',
      cases: [
        { input: 'Write a two-sentence product blurb for a reusable water bottle.', check: { kind: 'tool_used', value: '{{tool:critic}}' } },
        { input: 'Write a polite note declining a meeting on Friday.', check: { kind: 'judge', value: 'Clearly declines the Friday meeting, is polite, and is under 80 words.' } },
        { input: 'Write a two-sentence product blurb for a reusable water bottle.', check: { kind: 'judge', value: 'Exactly two sentences, about a reusable water bottle, with at least one concrete benefit.' } },
      ],
    },
  },
]

export type ModelChoice = Pick<AgentConfig, 'provider' | 'modelId' | 'baseUrl'>

export interface InstalledTemplate {
  agents: AgentConfig[]
  entryId: string
  evalSet: EvalSet | null
}

/** Build the agents (and test set) for a template without saving them. Pure, for testing. */
export function buildTemplate(t: AgentTemplate, model: ModelChoice): InstalledTemplate {
  const ids = new Map(t.agents.map((a) => [a.key, crypto.randomUUID()]))
  const names = new Map(t.agents.map((a) => [a.key, a.name]))
  const fill = (text: string) =>
    text.replace(/\{\{tool:([a-z0-9_]+)\}\}/g, (m, key: string) => (names.has(key) ? agentToolName(names.get(key)!) : m))

  const agents = t.agents.map((a) =>
    newAgent({
      id: ids.get(a.key)!,
      name: a.name,
      systemPrompt: fill(a.systemPrompt),
      toolNames: a.toolNames.map((n) => (n.startsWith('@') ? agentRef(ids.get(n.slice(1)) ?? n) : n)),
      ...(a.maxSteps ? { maxSteps: a.maxSteps } : {}),
      ...(a.temperature !== undefined ? { temperature: a.temperature } : {}),
      // Every agent gets the same model: only one local model fits in GPU memory.
      ...model,
    }),
  )

  let evalSet: EvalSet | null = null
  if (t.tests) {
    evalSet = newEvalSet(t.tests.name)
    evalSet.cases = t.tests.cases.map((c) => ({ id: crypto.randomUUID(), input: c.input, check: { ...c.check, value: fill(c.check.value) } }))
  }
  return { agents, entryId: ids.get(t.entry)!, evalSet }
}

/** Save a template's agents, test set and documents. Returns the agent to select. */
export async function installTemplate(t: AgentTemplate, model: ModelChoice): Promise<InstalledTemplate> {
  const built = buildTemplate(t, model)
  await db.transaction('rw', db.agents, db.evalSets, async () => {
    await db.agents.bulkAdd(built.agents)
    if (built.evalSet) await db.evalSets.add(built.evalSet)
  })
  for (const doc of t.documents ?? []) {
    if ((await db.documents.where('title').equals(doc.title).count()) === 0) await addDocument(doc.title, doc.text)
  }
  return built
}
