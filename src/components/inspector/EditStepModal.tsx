import { Play, TriangleExclamationPoint } from 'lucide-react'
import { useState } from 'react'
import { editKind, editText, parseEditedResult, planResume } from '../../core/agent/replay'
import type { RunRecord } from '../../core/agent/types'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { Modal } from '../ui/Modal'

const REPLY_EXAMPLES = ['{"tool": "calculator", "args": {"expression": "6*7"}}', '{"final": "Your answer here"}']

/** Edit one step of a finished run, then continue the run from that point. */
export function EditStepModal({ run, index, onClose, onRun }: { run: RunRecord; index: number; onClose: () => void; onRun: (text: string) => void }) {
  const step = run.steps[index]
  const kind = editKind(step)
  const [text, setText] = useState(() => editText(step))

  const check = kind === 'result' ? parseEditedResult(text) : null
  const planned = planResume(run, index, text)
  const missingHistory = planned.ok && planned.plan.missingHistory

  return (
    <Modal title={kind === 'result' ? 'Edit tool result and re-run' : 'Edit model reply and re-run'} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-1 text-xs text-zinc-400">
          <p>
            {kind === 'result'
              ? 'Change what the tool returned. The model gets your version and the run continues from there: see how it reacts to a different result or an error.'
              : 'Change what the model replied. Your text is used as if the model wrote it (a tool call or a final answer), then the run continues.'}{' '}
            Steps before this one are replayed exactly; the run uses the agent’s current model and tools.
          </p>
          <InfoTip id="rerun" />
        </div>
        <textarea
          aria-label={kind === 'result' ? 'Tool result JSON' : 'Model reply'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          className={`${inputClass} resize-y font-mono text-xs`}
        />
        {kind === 'reply' && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            Try:
            {REPLY_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-zinc-600">
                {ex}
              </button>
            ))}
          </div>
        )}
        {check && !check.ok && <p className="text-xs text-red-300">{check.error}</p>}
        {!planned.ok && kind !== 'result' && <p className="text-xs text-red-300">{planned.error}</p>}
        {missingHistory && (
          <p className="flex items-start gap-1.5 text-xs text-amber-300">
            <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0" /> This was a follow-up in a chat saved before earlier turns were recorded, so the re-run won’t include them.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!planned.ok} onClick={() => onRun(text)}>
            <Play className="size-3.5" /> Re-run from here
          </Button>
        </div>
      </div>
    </Modal>
  )
}
