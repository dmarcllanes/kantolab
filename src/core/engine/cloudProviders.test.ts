import { describe, expect, it } from 'vitest'
import { chatModelIds, CLOUD_PRESETS, normalizeBaseUrl, presetForBaseUrl, serverKeySetting } from './cloudProviders'

describe('cloud presets', () => {
  it('have unique ids and https base URLs without a trailing slash', () => {
    expect(new Set(CLOUD_PRESETS.map((p) => p.id)).size).toBe(CLOUD_PRESETS.length)
    for (const p of CLOUD_PRESETS) {
      expect(p.baseUrl).toMatch(/^https:\/\/[^\s]+[^/]$/)
      expect(p.keyUrl).toMatch(/^https:\/\//)
    }
  })

  it('finds a preset from a typed URL regardless of case or trailing slash', () => {
    expect(presetForBaseUrl('https://API.groq.com/openai/v1/')?.id).toBe('groq')
    expect(presetForBaseUrl('http://localhost:11434/v1')).toBeUndefined()
    expect(presetForBaseUrl('')).toBeUndefined()
  })

  it('gives each server its own key setting', () => {
    expect(serverKeySetting('https://api.groq.com/openai/v1/')).toBe(serverKeySetting('https://api.groq.com/openai/v1'))
    expect(serverKeySetting('https://api.groq.com/openai/v1')).not.toBe(serverKeySetting('https://openrouter.ai/api/v1'))
    expect(normalizeBaseUrl('not a url/')).toBe('not a url')
  })

  it('keeps chat models only and strips "models/" prefixes', () => {
    expect(chatModelIds(['models/gemini-2.5-flash', 'whisper-large-v3', 'text-embedding-004', 'llama-3.3-70b', 'llama-3.3-70b'])).toEqual(['gemini-2.5-flash', 'llama-3.3-70b'])
    // A real Groq list (Nov 2026): the Orpheus text-to-speech models are not chat models.
    expect(chatModelIds(['allam-2-7b', 'canopylabs/orpheus-arabic-saudi', 'canopylabs/orpheus-v1-english', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'])).toEqual([
      'allam-2-7b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b',
    ])
  })
})
