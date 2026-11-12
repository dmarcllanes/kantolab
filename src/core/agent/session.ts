// Glue between the UI, the store, the engines and the loop. Owns the one
// active provider, the abort controller and the pending approval.
import { apiKeySetting, createAnthropicProvider, createOpenAICompatibleProvider } from '../engine/providers'
import type { ChatMessage, ChatProvider } from '../engine/types'
import { loadModel, unloadModel } from '../engine/webllm'
import { db, getSetting } from '../memory/db'
import { resolveTools } from '../tools/registry'
import { runAgent, type RunOutcome } from './runner'
import { isBusy, useAgentStore } from './store'
import type { AgentConfig, RunRecord } from './types'

const s = () => useAgentStore.getState()

let localProvider: ChatProvider | null = null
let activeProvider: ChatProvider | null = null
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

  let outcome: RunOutcome
  try {
    activeProvider = await providerFor(agent)
    const tools = await resolveTools(agent.toolNames)
    controller = new AbortController()
    outcome = await runAgent(
      { agent, provider: activeProvider, tools, userMessage, signal: controller.signal, history: opts.history },
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
    activeProvider = null
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
  }
  s().setLastRun(record)
  try {
    await db.runs.add(record)
  } catch (e) {
    console.error('Could not save run history', e)
  }
  return outcome.status === 'COMPLETED' ? { record, answer: outcome.answer, raw: outcome.raw } : { record }
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

/** Stop the current run. Model loading can't be interrupted safely, so it's ignored. */
export function stopRun(): void {
  if (s().status === 'LOADING_MODEL') return
  controller?.abort()
  activeProvider?.interrupt()
  approvalResolver?.(false)
}

export function resolveApproval(approved: boolean): void {
  approvalResolver?.(approved)
}
