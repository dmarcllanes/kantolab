// Glue between the UI, the store, the engines and the loop. Owns the one
// active provider, the abort controller and the pending approval.
import { apiKeySetting, createAnthropicProvider, createOpenAICompatibleProvider } from '../engine/providers'
import type { ChatMessage, ChatProvider } from '../engine/types'
import { loadModel, unloadModel } from '../engine/webllm'
import { db, getSetting } from '../memory/db'
import { resolveTools } from '../tools/registry'
import { runAgent, type RunOutcome } from './runner'
import { isBusy, useAgentStore } from './store'
import { planResume, type ResumePlan } from './replay'
import { resolveAgentTools, type ResolveDeps } from './subagent'
import type { AgentConfig, RunRecord } from './types'

const s = () => useAgentStore.getState()

let localProvider: ChatProvider | null = null
/** Providers of the running agent and any sub-agents it called (for Stop). */
const activeProviders = new Set<ChatProvider>()
let controller: AbortController | null = null
let approvalResolver: ((approved: boolean) => void) | null = null

async function ensureLocalModel(modelId: string): Promise<ChatProvider> {
  if (localProvider && s().loadedModelId === modelId) return localProvider
  s().transition('LOADING_MODEL')
  s().setLoadProgress(0, 'Starting worker…')
  try {
    localProvider = await loadModel(modelId, (r) => s().setLoadProgress(r.progress, r.text))
  } catch (e) {
    localProvider = null
    s().setLoadedModel(null)
    throw e
  }
  s().setLoadedModel(modelId)
  s().transition('IDLE')
  return localProvider
}

async function providerFor(agent: AgentConfig): Promise<ChatProvider> {
  if (agent.provider === 'webllm') return ensureLocalModel(agent.modelId)
  if (!agent.modelId.trim()) throw new Error('Set a model name for this agent first.')
  const apiKey = await getSetting<string>(apiKeySetting(agent.provider))
  if (!apiKey) throw new Error('No API key saved for this provider. Add one in Settings.')
  if (agent.provider === 'anthropic') return createAnthropicProvider({ apiKey, model: agent.modelId })
  if (!agent.baseUrl.trim()) throw new Error('Set a base URL for this OpenAI-compatible agent.')
  return createOpenAICompatibleProvider({ baseUrl: agent.baseUrl, apiKey, model: agent.modelId })
}

/**
 * Provider for an agent called as a tool mid-run. It must not touch the state
 * machine, so a local model is only usable if it's the one already loaded.
 */
async function subagentProviderFor(agent: AgentConfig): Promise<ChatProvider> {
  if (agent.provider === 'webllm') {
    const loaded = s().loadedModelId
    if (!localProvider || loaded !== agent.modelId) {
      throw new Error(
        loaded
          ? `"${agent.name}" uses local model ${agent.modelId}, but ${loaded} is loaded. Only one local model fits in memory at a time: give both agents the same local model, or switch one to an API provider.`
          : `"${agent.name}" uses local model ${agent.modelId}, which isn't loaded. Load it first from that agent's model picker.`,
      )
    }
    activeProviders.add(localProvider)
    return localProvider
  }
  const provider = await providerFor(agent)
  activeProviders.add(provider)
  return provider
}

const toolDeps: ResolveDeps = {
  providerFor: subagentProviderFor,
  toolsFor: (agent, ancestors) => resolveAgentTools(agent, ancestors, toolDeps),
  resolvePlain: resolveTools,
  loadAgent: (id) => db.agents.get(id),
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Download/compile a local model ahead of the first run. */
export async function preloadModel(modelId: string): Promise<void> {
  if (isBusy(s().status)) return
  try {
    await ensureLocalModel(modelId)
  } catch (e) {
    s().fail(`Model failed to load: ${errorText(e)}`)
  }
}

export async function releaseModel(): Promise<void> {
  if (isBusy(s().status)) return
  await unloadModel()
  localProvider = null
  s().setLoadedModel(null)
}

export interface RunOptions {
  /** Earlier chat turns to replay before the new message. */
  history?: ChatMessage[]
  /** 'deny' auto-denies tools that ask first (used by unattended test runs). */
  approval?: 'ask' | 'deny'
  /** Continue another run from an edited step (see rerunFrom). */
  resume?: { plan: ResumePlan; rerunOf: string }
}

export interface RunResult {
  record: RunRecord
  answer?: string
  raw?: string
}

/** Run one message through an agent, record it in the store and in history. */
export async function startRun(agent: AgentConfig, userMessage: string, opts: RunOptions = {}): Promise<RunResult | null> {
  if (isBusy(s().status)) return null
  s().viewRun(null)
  s().resetRun()
  const startedAt = Date.now()
  const plan = opts.resume?.plan
  const history = plan ? plan.history : opts.history
  for (const step of plan?.prefix ?? []) s().appendStep(step)

  let outcome: RunOutcome
  try {
    const provider = await providerFor(agent)
    activeProviders.add(provider)
    const tools = await resolveAgentTools(agent, [agent.id], toolDeps)
    controller = new AbortController()
    outcome = await runAgent(
      {
        agent,
        provider,
        tools,
        userMessage,
        signal: controller.signal,
        history,
        ...(plan ? { resume: { system: plan.system, messages: plan.messages, nextReply: plan.nextReply, stepsUsed: plan.stepsUsed } } : {}),
      },
      {
        setStatus: (status) => s().transition(status),
        addStep: (step) => s().appendStep(step),
        onPartial: (text) => s().setStream(text),
        requestApproval:
          opts.approval === 'deny'
            ? async () => false
            : (call) =>
                new Promise<boolean>((resolve) => {
                  approvalResolver = (approved) => {
                    approvalResolver = null
                    s().setPendingApproval(null)
                    resolve(approved)
                  }
                  s().setPendingApproval(call)
                }),
      },
    )
  } catch (e) {
    outcome = { status: 'ERROR', error: errorText(e) }
  } finally {
    controller = null
    activeProviders.clear()
    s().setStream(null)
  }

  if (outcome.status === 'ERROR') s().fail(outcome.error)
  if (outcome.status === 'ABORTED') {
    s().appendStep({ kind: 'error', content: 'Run stopped by user.' })
    s().transition('IDLE')
  }

  const record: RunRecord = {
    id: crypto.randomUUID(),
    agentId: agent.id,
    agentName: agent.name,
    modelId: agent.modelId,
    userMessage,
    startedAt,
    endedAt: Date.now(),
    outcome: outcome.status === 'COMPLETED' ? 'completed' : outcome.status === 'ERROR' ? 'error' : 'stopped',
    steps: s().trace,
    ...(history?.length ? { history } : {}),
    ...(opts.resume ? { rerunOf: opts.resume.rerunOf } : {}),
  }
  s().setLastRun(record)
  try {
    await db.runs.add(record)
  } catch (e) {
    console.error('Could not save run history', e)
  }
  return outcome.status === 'COMPLETED' ? { record, answer: outcome.answer, raw: outcome.raw } : { record }
}

/**
 * Re-run `run` from step `index`, with that step's model reply or tool result
 * replaced by `text`. Uses the agent's current model and tools, and the run's
 * original system prompt. Returns an error message, or null once it has run.
 */
export async function rerunFrom(run: RunRecord, index: number, text: string): Promise<string | null> {
  if (isBusy(s().status) || s().batch) return 'Wait for the current run to finish.'
  const agent = await db.agents.get(run.agentId)
  if (!agent) return `The agent "${run.agentName}" was deleted, so this run can't be continued.`
  const planned = planResume(run, index, text)
  if (!planned.ok) return planned.error
  await startRun(agent, run.userMessage, { resume: { plan: planned.plan, rerunOf: run.id } })
  return null
}

/** Send a chat message: continues the conversation with this agent if one is open. */
export async function sendMessage(agent: AgentConfig, message: string): Promise<void> {
  const { chat, chatAgentId } = s()
  const turns = chatAgentId === agent.id ? chat : []
  if (chatAgentId !== agent.id) s().resetChat()
  const history: ChatMessage[] = turns.flatMap((t) => [
    { role: 'user' as const, content: t.user },
    { role: 'assistant' as const, content: t.raw },
  ])
  const result = await startRun(agent, message, { history })
  if (result?.answer !== undefined && result.raw !== undefined) {
    s().pushChatTurn(agent.id, { user: message, answer: result.answer, raw: result.raw })
  }
}

/**
 * One plain chat call with an agent's model, outside the agent loop (used by
 * the AI grader). May load a local model, so call it only between runs.
 */
export async function chatOnce(agent: AgentConfig, messages: ChatMessage[], temperature = 0): Promise<string> {
  const provider = await providerFor(agent)
  activeProviders.add(provider)
  try {
    return await provider.chat(messages, { temperature })
  } finally {
    activeProviders.delete(provider)
  }
}

/** Stop the current run. Model loading can't be interrupted safely, so it's ignored. */
export function stopRun(): void {
  if (s().status === 'LOADING_MODEL') return
  controller?.abort()
  for (const p of activeProviders) p.interrupt()
  approvalResolver?.(false)
}

export function resolveApproval(approved: boolean): void {
  approvalResolver?.(approved)
}
