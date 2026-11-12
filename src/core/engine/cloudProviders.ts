// Cloud AI providers with a free tier that accept requests straight from a
// browser (CORS checked). All speak the OpenAI chat-completions format, so an
// agent using one is an ordinary 'openai-compatible' agent with a known base URL.

export interface CloudPreset {
  id: string
  name: string
  baseUrl: string
  /** Where to create a key. */
  keyUrl: string
  /** One line on the free tier. Tiers change; keep this short and hedged. */
  free: string
  /**
   * Suggested model. Providers rename models often, so the editor also loads
   * the live list from the provider once a key is saved.
   */
  defaultModel: string
}

export const CLOUD_PRESETS: CloudPreset[] = [
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    free: 'Free tier with rate limits, no card needed. Very fast.',
    // Checked against a real key's model list (Nov 2026).
    defaultModel: 'openai/gpt-oss-120b',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    free: 'Generous free tier from Google AI Studio, no card needed.',
    defaultModel: 'gemini-2.5-flash',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/settings/keys',
    free: 'Free models (names end in :free) with a daily request cap. “openrouter/free” picks one for you.',
    defaultModel: 'openrouter/free',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyUrl: 'https://cloud.cerebras.ai',
    free: 'Free tier with daily limits. Very fast.',
    defaultModel: 'llama-3.3-70b',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    free: 'Free “Experiment” plan (asks for phone verification).',
    defaultModel: 'mistral-small-latest',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    keyUrl: 'https://huggingface.co/settings/tokens',
    free: 'Small free credit every month across many open models.',
    defaultModel: '',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    free: 'Free trial key with rate limits (not for commercial use).',
    defaultModel: 'command-a-03-2025',
  },
]

/** Lower-case origin + path, no trailing slash: one key per API address. */
export function normalizeBaseUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl.trim())
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  }
}

export function presetForBaseUrl(baseUrl: string): CloudPreset | undefined {
  const n = normalizeBaseUrl(baseUrl)
  return n ? CLOUD_PRESETS.find((p) => normalizeBaseUrl(p.baseUrl) === n) : undefined
}

/** Settings key for an OpenAI-compatible server's API key. */
export function serverKeySetting(baseUrl: string): string {
  return `apiKey:openai-compatible@${normalizeBaseUrl(baseUrl)}`
}

/** Model ids from a /models listing, without "models/" prefixes or non-chat models. */
export function chatModelIds(ids: string[]): string[] {
  const clean = ids.map((id) => id.replace(/^models\//, ''))
  return [...new Set(clean.filter((id) => !/(whisper|embed|tts|transcri|moderation|rerank|guard|aqa|imagen|veo|-image|playai|orpheus|speech|audio)/i.test(id)))].sort()
}
