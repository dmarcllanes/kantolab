import { ArrowRight, Bot, MessageSquare, Repeat2, Sparkles, Wrench } from 'lucide-react'

function Node({ icon: Icon, label, sub }: { icon: typeof Bot; label: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900">
        <Icon className="size-4 text-zinc-300" />
      </div>
      <span className="text-xs font-medium text-zinc-200">{label}</span>
      <span className="text-[11px] leading-tight text-zinc-500">{sub}</span>
    </div>
  )
}

/** Empty-state explainer for the trace: what happens when you press Run. */
export function HowItWorks({ toolCount }: { toolCount: number }) {
  return (
    <div className="space-y-4 rounded-lg border border-dashed border-zinc-800 p-4">
      <p className="text-center text-xs font-semibold tracking-wide text-zinc-400 uppercase">What happens when you press Run</p>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-start gap-1">
        <Node icon={MessageSquare} label="You" sub="ask a question" />
        <ArrowRight className="mt-3 size-4 text-zinc-600" />
        <Node icon={Bot} label="Model" sub="thinks, picks a tool or answers" />
        <div className="mt-2 flex flex-col items-center text-zinc-600">
          <Repeat2 className="size-4" />
          <span className="text-[10px]">loop</span>
        </div>
        <Node icon={Wrench} label="Tools" sub={toolCount ? `${toolCount} enabled` : 'none enabled'} />
        <ArrowRight className="mt-3 size-4 text-zinc-600" />
        <Node icon={Sparkles} label="Answer" sub="final reply" />
      </div>
      <p className="text-center text-xs text-zinc-500">Every step shows up here as a card you can open: the exact prompt, each tool call, and the raw JSON.</p>
    </div>
  )
}
