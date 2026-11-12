import { describe, expect, it } from 'vitest'
import { DocumentIndex, chunkText } from './search'

describe('chunkText', () => {
  it('merges short paragraphs and splits long ones', () => {
    expect(chunkText('a\n\nb\n\nc', 700)).toEqual(['a\n\nb\n\nc'])
    const long = 'x'.repeat(2000)
    expect(chunkText(long, 700).every((c) => c.length <= 1050)).toBe(true)
    expect(chunkText(long, 700).join('')).toBe(long)
  })
})

describe('DocumentIndex', () => {
  it('finds, ranks and removes documents', () => {
    const idx = new DocumentIndex()
    idx.add({ id: 'a', title: 'Onboarding', text: 'Our refund policy allows returns within 30 days.', createdAt: 0 })
    idx.add({ id: 'b', title: 'Shipping', text: 'Orders ship from Manila within two business days.', createdAt: 0 })
    expect(idx.search('refund')[0]).toMatchObject({ docId: 'a', title: 'Onboarding' })
    expect(idx.search('manila')[0].docId).toBe('b')
    idx.remove('a')
    expect(idx.search('refund')).toEqual([])
  })
})
