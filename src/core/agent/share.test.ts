import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../memory/db'
import { deleteAgent, newAgent } from './agents'
import { agentRef } from './subagent'
import { bundleAgent, decodeBundle, encodeBundle, importBundle, parseBundle } from './share'

beforeEach(async () => {
  await Promise.all([db.agents.clear(), db.customTools.clear()])
})

const tool = {
  id: 't1',
  name: 'shout',
  description: 'Uppercase text',
  params: [{ id: 'p1', name: 'text', type: 'string' as const, description: '', required: true }],
  code: 'return input.text.toUpperCase()',
  requiresApproval: false,
  timeoutMs: 5000,
  createdAt: 0,
  updatedAt: 0,
}

describe('share', () => {
  it('never bundles or imports references to other local agents', async () => {
    const agent = newAgent({ toolNames: ['calculator', agentRef('local-only')] })
    const bundle = await bundleAgent(agent)
    expect(bundle.agent.toolNames).toEqual(['calculator'])
    const imported = await importBundle({ ...bundle, agent: { ...bundle.agent, toolNames: ['calculator', agentRef('x')] } })
    expect(imported.toolNames).toEqual(['calculator'])
  })

  it('removes a deleted agent from agents that used it as a tool', async () => {
    const helper = newAgent()
    const boss = newAgent({ toolNames: ['calculator', agentRef(helper.id)] })
    await db.agents.bulkAdd([helper, boss])
    await deleteAgent(helper.id)
    expect((await db.agents.get(boss.id))?.toolNames).toEqual(['calculator'])
  })

  it('round-trips an agent with its custom tools through a URL-safe string', async () => {
    await db.customTools.add(tool)
    const agent = newAgent({ name: 'Shouter', toolNames: ['calculator', 'shout'], systemPrompt: 'Be loud. ✨' })
    const bundle = await bundleAgent(agent)
    expect(bundle.customTools.map((t) => t.name)).toEqual(['shout'])
    expect(JSON.stringify(bundle)).not.toContain('apiKey')

    const encoded = await encodeBundle(bundle)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeBundle(encoded)).toEqual(bundle)
  })

  it('rejects damaged links and invalid bundles', async () => {
    await expect(decodeBundle('not-a-real-link')).rejects.toThrow(/damaged/)
    expect(() => parseBundle({ kantolab: 1, agent: { name: '' }, customTools: [] })).toThrow(/not a valid/)
  })

  it('imports as a new agent, reusing identical tools and renaming conflicting ones', async () => {
    await db.customTools.add(tool)
    const bundle = await bundleAgent(newAgent({ name: 'A', toolNames: ['shout'] }))

    const same = await importBundle(bundle)
    expect(same.toolNames).toEqual(['shout'])
    expect(await db.customTools.count()).toBe(1)

    bundle.customTools[0].code = 'return "different"'
    const clash = await importBundle(bundle)
    expect(clash.toolNames).toEqual(['shout_2'])
    expect((await db.customTools.where('name').equals('shout_2').first())?.code).toBe('return "different"')
    expect(await db.agents.count()).toBe(2)
  })
})
