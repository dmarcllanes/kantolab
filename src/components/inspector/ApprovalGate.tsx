import { ShieldExclamationPoint } from 'lucide-react'
import type { PendingApproval } from '../../core/agent/store'
import { resolveApproval } from '../../core/agent/session'
import { Button } from '../ui/Button'
import { JsonView } from '../ui/JsonView'

export function ApprovalGate({ pending }: { pending: PendingApproval }) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <ShieldExclamationPoint className="size-4" />
        {pending.agent ? (
          <span>
            Sub-agent <span className="text-amber-100">{pending.agent}</span> wants to run
          </span>
        ) : (
          'The agent wants to run'
        )}{' '}
        <code className="font-mono">{pending.tool}</code>
      </div>
      <div className="mt-2">
        <JsonView value={pending.args} expandDepth={3} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={() => resolveApproval(true)}>
          Approve
        </Button>
        <Button variant="danger" onClick={() => resolveApproval(false)}>
          Deny
        </Button>
      </div>
    </div>
  )
}
