// Plain-language explanations of trace steps for Guide mode. Pure functions:
// they read a step and say what happened and why, for someone new to agents.
import type { TraceStep } from '../../core/agent/types'

export interface StepExplanation {
  /** What happened, in one or two sentences. */
  text: string
  /** What the user could do about it, when there's something useful to suggest. */
  hint?: string
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s)

function summarize(value: unknown): string {
  if (value === null || value === undefined) return 'nothing'
  if (typeof value === 'string') return `“${short(value)}”`
  if (typeof value !== 'object') return String(value)
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return 'no inputs'
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k} = ${typeof v === 'string' ? `“${short(v, 40)}”` : short(JSON.stringify(v) ?? '', 40)}`)
    .join(', ')
    .concat(entries.length > 3 ? ', …' : '')
}

const toolOf = (step: TraceStep) => step.content.split(/[\s(]/)[0]

function explainError(content: string): StepExplanation {
  if (/api key/i.test(content)) return { text: 'The run could not start: this provider needs an API key.', hint: 'Open Settings (the gear, top right) and paste your key, or switch the agent to Local (WebLLM).' }
  if (/webgpu/i.test(content)) return { text: 'Your browser or GPU can’t run local models.', hint: 'Try a recent Chrome or Edge, or switch the agent’s Provider to an API option.' }
  if (/Stopped after \d+ steps/.test(content)) return { text: 'The agent used all its allowed steps without giving a final answer.', hint: 'Raise “Max steps”, make the system prompt clearer, or try a bigger model.' }
  if (/JSON protocol/.test(content)) return { text: 'The model kept replying in the wrong format, so the run was stopped.', hint: 'Lower the temperature, use fewer tools, or try a bigger model: small models struggle with strict JSON.' }
  if (/stopped by user/i.test(content)) return { text: 'You pressed Stop, so the run ended here.' }
  if (/failed to load|model/i.test(content)) return { text: `The model could not be used: ${short(content, 120)}`, hint: 'Check your internet connection for the first download, or pick a smaller model.' }
  return { text: `The run stopped with an error: ${short(content, 140)}` }
}

export function explainStep(step: TraceStep): StepExplanation {
  const data = (step.data ?? {}) as Record<string, unknown>
  const within = step.depth ? `Inside the “${step.agent}” sub-agent: ` : ''
  let out: StepExplanation

  switch (step.kind) {
    case 'system':
      out = {
        text: 'The full instructions the model received: your system prompt, plus (when tools are on) the tool list and the JSON reply format KantoLab adds automatically.',
        hint: 'Open it to see exactly what the model was told.',
      }
      break
    case 'user':
      out = { text: step.depth ? 'The task the main agent handed over. The sub-agent sees only this, not your chat.' : 'Your message, exactly as the model received it.' }
      break
    case 'tool_call': {
      const tool = typeof data.tool === 'string' ? data.tool : toolOf(step)
      const thought = typeof data.thought === 'string' && data.thought.trim() ? ` Its reasoning: “${short(data.thought, 120)}”.` : ''
      out = tool.startsWith('ask_')
        ? { text: `The model decided to hand part of the job to another agent (${tool}).${thought} That agent’s steps appear indented below.` }
        : { text: `The model decided it needs a tool: it asked to run ${tool} with ${summarize(data.args)}.${thought} KantoLab checks these inputs before running anything.` }
      break
    }
    case 'tool_result': {
      const tool = toolOf(step)
      const ms = typeof data.ms === 'number' ? ` in ${data.ms} ms` : ''
      if (data.ok === true) out = { text: `${tool} ran${ms} and returned ${summarize(data.output)}. This result is sent back to the model so it can carry on.` }
      else if (data.stage === 'input') out = { text: `${tool} did not run: the model’s inputs didn’t match what the tool accepts. The error goes back to the model so it can fix its call.` }
      else if (data.stage === 'output') out = { text: `${tool} ran but returned data in an unexpected shape, so it was rejected. The model is told what went wrong.` }
      else out = { text: `${tool} ran into a problem: ${short(String(data.error ?? 'unknown error'), 120)}. The model is told, and can try another way.` }
      break
    }
    case 'approval':
      out = data.approved
        ? { text: 'You approved the tool call, so it ran.' }
        : { text: 'The tool call was denied, so it did not run. The model is told and can try another way.', hint: 'In test runs, tools that ask first are denied automatically.' }
      break
    case 'assistant':
      out = step.depth
        ? { text: 'The sub-agent’s final answer. It goes back to the main agent as the tool’s result.' }
        : { text: 'The final answer: the run is complete.', hint: 'Type a follow-up to continue the chat, or press Edit on any step to try a different path.' }
      break
    case 'error':
      out =
        typeof data.raw === 'string'
          ? { text: 'The model’s reply wasn’t in the required JSON format. KantoLab showed it the problem and asked again (it gets two retries in a row).', hint: 'Open “data” to see what it actually wrote.' }
          : explainError(step.content)
      break
  }

  const marks = [step.replayed ? 'Copied from the original run (not re-computed).' : '', step.edited ? 'You edited this step.' : ''].filter(Boolean).join(' ')
  return { text: `${within}${out.text}${marks ? ` ${marks}` : ''}`, ...(out.hint ? { hint: out.hint } : {}) }
}
