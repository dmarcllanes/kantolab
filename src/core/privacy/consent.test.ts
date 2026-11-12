import { describe, expect, it } from 'vitest'
import { ALL_CONSENT, consentProblem, currentConsent, DEFAULT_CONSENT, parseStoredConsent, useConsent } from './consent'

describe('consent', () => {
  it('blocks each provider kind until it is allowed', () => {
    expect(consentProblem('webllm', DEFAULT_CONSENT)).toContain('Run AI on this device')
    expect(consentProblem('anthropic', DEFAULT_CONSENT)).toContain('Use AI providers you choose')
    expect(consentProblem('openai-compatible', { ...DEFAULT_CONSENT, localAi: true })).not.toBeNull()
    expect(consentProblem('webllm', ALL_CONSENT)).toBeNull()
    expect(consentProblem('openai-compatible', ALL_CONSENT)).toBeNull()
  })

  it('only trusts a well-formed stored answer', () => {
    expect(parseStoredConsent(JSON.stringify(ALL_CONSENT))).toEqual(ALL_CONSENT)
    expect(parseStoredConsent('{"localAi":"yes"}')).toBeNull()
    expect(parseStoredConsent('not json')).toBeNull()
    expect(parseStoredConsent(null)).toBeNull()
  })

  it('asks on every visit and allows nothing optional before an answer', () => {
    expect(useConsent.getState().decided).toBe(false)
    expect(useConsent.getState().dialogOpen).toBe(true)
    expect(currentConsent()).toEqual(DEFAULT_CONSENT)
    useConsent.getState().decide(ALL_CONSENT)
    expect(currentConsent()).toEqual(ALL_CONSENT)
    expect(useConsent.getState().dialogOpen).toBe(false)
  })
})
