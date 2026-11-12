import { describe, expect, it } from 'vitest'
import { readOpenAIStream } from './providers'

function sse(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p))
      c.close()
    },
  })
}

describe('readOpenAIStream', () => {
  it('assembles deltas across chunk boundaries and ignores noise', async () => {
    const seen: string[] = []
    const text = await readOpenAIStream(
      sse([
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        '\ndata: {"choices":[{"del',
        'ta":{"content":"lo"}}]}\n\n: keep-alive\n\ndata: not json\n\n',
        'data: [DONE]\n\n',
      ]),
      (t) => seen.push(t),
    )
    expect(text).toBe('Hello')
    expect(seen).toEqual(['Hel', 'Hello'])
  })
})
