// "What to do next" for the Run panel in Guide mode, from the current state.
import type { AgentStatus, RunOutcomeKind } from '../../core/agent/types'

export interface RunPanelState {
  hasAgent: boolean
  isLocal: boolean
  needsLoad: boolean
  noGpu: boolean
  /** The agent's provider is turned off in the privacy choices. */
  blocked?: boolean
  status: AgentStatus
  hasMessage: boolean
  hasSteps: boolean
  awaitingApproval: boolean
  viewingSaved: boolean
  batch: boolean
  lastOutcome?: RunOutcomeKind
  inChat: boolean
}

export interface NextStep {
  /** Short label like "Step 1 of 3". */
  label?: string
  text: string
  tone: 'info' | 'action' | 'done' | 'problem'
}

export function nextStep(s: RunPanelState): NextStep {
  if (!s.hasAgent) return { tone: 'action', text: 'Pick an agent on the left, or press New to create one.' }
  if (s.viewingSaved) return { tone: 'info', text: 'You’re looking at a saved run. Read it top to bottom, press Edit on a step to try another path, or press Live to go back.' }
  if (s.batch) return { tone: 'info', text: 'A comparison or test run is using the agent. Its steps show here as they happen; manage it from its own tab.' }
  if (s.blocked && s.status !== 'THINKING') return { tone: 'problem', text: 'This agent needs something you turned off in your privacy choices. Press “Change privacy choices” and switch it on, or pick an agent that uses what you allowed.' }
  if (s.noGpu) return { tone: 'problem', text: 'This browser can’t run local models. Change the agent’s Provider to a free cloud AI like Groq or Google Gemini (get a free key with one click), or open KantoLab in a recent Chrome or Edge.' }
  switch (s.status) {
    case 'LOADING_MODEL':
      return { tone: 'info', text: 'Loading the model. The first time it downloads (about 1 GB for the default) and saves it in your browser; later it loads in seconds.' }
    case 'THINKING':
      return { tone: 'info', text: 'The model is writing its reply. Watch it appear live below. Small local models can take a few seconds per step.' }
    case 'EXECUTING_TOOL':
      return { tone: 'info', text: 'A tool is running. Its result will be handed back to the model.' }
    case 'AWAITING_APPROVAL':
      return { tone: 'action', text: 'The agent wants to use a tool that asks first. Check what it wants to send below, then press Approve or Deny.' }
  }
  if (s.isLocal && s.needsLoad) return { tone: 'action', label: 'Step 1 of 3', text: 'Press Load model. This downloads the AI model into your browser once; after that it works offline and for free.' }
  if (s.status === 'ERROR') return { tone: 'problem', text: 'Something went wrong. The red card below explains why and what to try. Fix it, then press Run again.' }
  if (s.hasMessage) return { tone: 'action', label: 'Step 3 of 3', text: 'Press Run (or Ctrl/⌘ + Enter) to send your question to the agent.' }
  if (s.status === 'COMPLETED' || (s.hasSteps && s.lastOutcome === 'completed'))
    return {
      tone: 'done',
      text: 'Done! Read the trace below from top to bottom: each card explains what happened. Type a follow-up to keep chatting, or press Edit on a step to try a different path.',
    }
  return {
    tone: 'action',
    label: s.isLocal ? 'Step 2 of 3' : undefined,
    text: s.inChat ? 'Type a follow-up question; the agent remembers this chat until you press New chat.' : 'Type a question for the agent, or tap one of the examples, then press Run.',
  }
}
