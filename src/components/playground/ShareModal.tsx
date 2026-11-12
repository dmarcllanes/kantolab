import { ClipboardCheck, Download, Link } from 'lucide-react'
import { useEffect, useState } from 'react'
import { bundleAgent, encodeBundle, shareUrl, type AgentBundle } from '../../core/agent/share'
import type { AgentConfig } from '../../core/agent/types'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { Modal } from '../ui/Modal'

const LONG_LINK = 8000

export function ShareModal({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) {
  const [bundle, setBundle] = useState<AgentBundle | null>(null)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void bundleAgent(agent).then(async (b) => {
      setBundle(b)
      setUrl(shareUrl(await encodeBundle(b)))
    })
  }, [agent])

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    if (!bundle) return
    const href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = href
    a.download = `${agent.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'agent'}.kantolab.json`
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <Modal title={`Share “${agent.name}”`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-1 text-xs text-zinc-400">
          <p>
            Includes the system prompt, settings and {agent.toolNames.length} enabled {agent.toolNames.length === 1 ? 'tool' : 'tools'}
            {bundle && bundle.customTools.length > 0 && ` (${bundle.customTools.length} custom, with code)`}. Never includes API keys.
          </p>
          <InfoTip id="share" />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Link className="size-3.5" /> Share link
          </label>
          <div className="flex gap-2">
            <input readOnly value={url || 'Preparing…'} onFocus={(e) => e.target.select()} aria-label="Share link" className={`${inputClass} font-mono text-xs`} />
            <Button variant="primary" disabled={!url} onClick={() => void copy()}>
              {copied ? <ClipboardCheck className="size-4" /> : null}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          {url.length > LONG_LINK && <p className="text-xs text-amber-300">This link is long ({Math.round(url.length / 1000)}k characters); some chat apps cut long links. The file is safer.</p>}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800 pt-3">
          <Button onClick={download} disabled={!bundle}>
            <Download className="size-4" /> Download file
          </Button>
          <span className="text-xs text-zinc-500">Import it with the Import button in the agent list.</span>
        </div>
      </div>
    </Modal>
  )
}
