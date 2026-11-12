// Provider-agnostic chat interface. WebLLM (local, in a worker) is the default;
// BYOK providers call a remote API straight from the browser with a key the
// user stores in IndexedDB. All of them implement ChatProvider.

export type ProviderKind = 'webllm' | 'openai-compatible' | 'anthropic'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  /** If set, the provider streams and calls this with the full text so far. */
  onText?: (text: string) => void
}

export interface ChatProvider {
  readonly id: string
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>
  /** Abort the in-flight generation, if any. */
  interrupt(): void
}
