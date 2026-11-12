import { useState } from 'react'
import { useAgentStore } from '../../core/agent/store'
import type { AgentConfig, RunRecord } from '../../core/agent/types'
import type { GpuProfile } from '../../core/engine/webgpu'
import { Tabs } from '../ui/Tabs'
import { ComparePanel } from './ComparePanel'
import { HistoryPanel } from './HistoryPanel'
import { RunPanel } from './RunPanel'
import { TestsPanel } from './TestsPanel'

const TABS = [
  { id: 'run', label: 'Run' },
  { id: 'compare', label: 'Compare' },
  { id: 'tests', label: 'Tests' },
  { id: 'history', label: 'History' },
] as const

export function InspectorTabs({ agent, gpu }: { agent: AgentConfig | undefined; gpu: GpuProfile | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('run')
  const viewRun = useAgentStore((s) => s.viewRun)
  const openRun = (run: RunRecord) => {
    viewRun(run)
    setTab('run')
  }
  return (
    <>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'run' && <RunPanel agent={agent} gpu={gpu} />}
      {tab === 'compare' && <ComparePanel current={agent} onOpenRun={openRun} />}
      {tab === 'tests' && <TestsPanel agent={agent} onOpenRun={openRun} />}
      {tab === 'history' && <HistoryPanel onOpened={() => setTab('run')} />}
    </>
  )
}
