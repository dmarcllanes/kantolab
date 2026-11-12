import { Gauge } from 'lucide-react'
import type { LiveStream } from '../../core/agent/store'
import { InfoTip } from '../ui/InfoTip'

/** The reply the model is writing right now, with a speed readout. */
export function LiveReply({ stream }: { stream: LiveStream }) {
  const seconds = Math.max(0.001, (stream.updatedAt - stream.startedAt) / 1000)
  const rate = stream.chunks > 1 ? stream.chunks / seconds : 0
  return (
    <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3" aria-live="off">
      <div className="flex items-center gap-2 text-xs">
        <span className="size-1.5 rounded-full bg-violet-300 motion-safe:animate-pulse" aria-hidden />
        <span className="font-medium text-violet-200">Model is writing</span>
        <InfoTip id="liveReply" />
        <span className="ml-auto flex items-center gap-1 font-mono text-zinc-400" title="Approximate tokens per second">
          <Gauge className="size-3" /> {rate ? `${rate.toFixed(0)} tok/s` : '…'}
        </span>
      </div>
      <p className="mt-1.5 max-h-48 overflow-y-auto font-mono text-xs break-words whitespace-pre-wrap text-zinc-200">
        {stream.text}
        <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-violet-300 motion-safe:animate-pulse" aria-hidden />
      </p>
    </div>
  )
}
