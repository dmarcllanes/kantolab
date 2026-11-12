// What the user allows KantoLab to do on this visit. Asked on every visit;
// the last answer pre-fills the dialog. The choice itself is a device
// preference, so it lives in localStorage (guarded: storage can be blocked).
import { z } from 'zod/v3'
import { create } from 'zustand'
import type { ProviderKind } from '../engine/types'

export const consentSchema = z.object({
  /** Use the GPU (WebGPU) and download model files to run AI on this device. */
  localAi: z.boolean(),
  /** Send messages to an AI provider the user picks (Anthropic, OpenAI-compatible, local servers). */
  remoteAi: z.boolean(),
  /** Ask the browser to keep KantoLab's data even when disk space runs low. */
  persistStorage: z.boolean(),
})
export type Consent = z.infer<typeof consentSchema>

/** Nothing optional until the user says so. Browser storage is required and always on. */
export const DEFAULT_CONSENT: Consent = { localAi: false, remoteAi: false, persistStorage: false }
export const ALL_CONSENT: Consent = { localAi: true, remoteAi: true, persistStorage: true }

const KEY = 'kantolab.consent'

export function parseStoredConsent(raw: string | null): Consent | null {
  if (!raw) return null
  try {
    const parsed = consentSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function load(): Consent | null {
  try {
    return parseStoredConsent(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

function save(c: Consent): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // Blocked storage: the choice applies to this visit only.
  }
}

/** Why a provider can't be used with these choices, or null if it can. */
export function consentProblem(provider: ProviderKind, c: Consent): string | null {
  if (provider === 'webllm' && !c.localAi)
    return 'Running AI on this device is turned off. Open Privacy (the shield, top right) and allow “Run AI on this device” to use local models.'
  if (provider !== 'webllm' && !c.remoteAi)
    return 'Sending messages to AI providers is turned off. Open Privacy (the shield, top right) and allow “Use AI providers you choose” to use this agent.'
  return null
}

interface ConsentState {
  choices: Consent
  /** The last saved answer exists (this is a returning visitor). */
  returning: boolean
  /** Answered on this visit. Resets on every page load by design. */
  decided: boolean
  dialogOpen: boolean
  decide: (c: Consent) => void
  openDialog: () => void
}

const stored = load()

export const useConsent = create<ConsentState>()((set) => ({
  choices: stored ?? DEFAULT_CONSENT,
  returning: stored !== null,
  decided: false,
  dialogOpen: true,
  decide: (choices) => {
    save(choices)
    set({ choices, decided: true, returning: true, dialogOpen: false })
  },
  openDialog: () => set({ dialogOpen: true }),
}))

/** Current choices, for non-React code (the session). Undecided = nothing optional allowed. */
export function currentConsent(): Consent {
  const s = useConsent.getState()
  return s.decided ? s.choices : DEFAULT_CONSENT
}
