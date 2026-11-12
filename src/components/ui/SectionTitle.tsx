import type { ReactNode } from 'react'
import type { TipId } from '../tips/tips'
import { InfoTip } from './InfoTip'

export function SectionTitle({ children, tip, action }: { children: ReactNode; tip?: TipId; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{children}</h3>
      {tip && <InfoTip id={tip} />}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}
