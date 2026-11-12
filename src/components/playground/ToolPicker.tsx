import { useLiveQuery } from 'dexie-react-hooks'
import { Bot, Code, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { agentAsTool, agentRef, agentToolName } from '../../core/agent/subagent'
import { db } from '../../core/memory/db'
import { BUILTIN_TOOLS } from '../../core/tools/builtin'
import { customToolToTool, newCustomTool, type CustomToolDef } from '../../core/tools/custom'
import { toolInputSchema } from '../../core/tools/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { InfoTip } from '../ui/InfoTip'
import { JsonView } from '../ui/JsonView'
import { SectionTitle } from '../ui/SectionTitle'
import { CustomToolEditor } from './CustomToolEditor'

function ToolRow({
  name,
  description,
  approval,
  checked,
  onToggle,
  schema,
  custom,
  onEdit,
  agentName,
}: {
  name: string
  description: string
  approval: boolean
  checked: boolean
  onToggle: (on: boolean) => void
  schema: () => unknown
  custom?: boolean
  onEdit?: () => void
  /** Shown for agent tools: the saved agent's display name. */
  agentName?: string
}) {
  const [showSchema, setShowSchema] = useState(false)
  const id = useId()
  return (
    <li className={`rounded-md border p-2.5 transition-colors ${checked ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
      <div className="flex items-start gap-2">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} aria-label={`Enable ${name}`} className="mt-1 accent-emerald-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <label htmlFor={id} className="cursor-pointer font-mono text-sm">
              {name}
            </label>
            {custom && <Badge tone="violet">custom</Badge>}
            {agentName && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Bot className="size-3" /> {agentName}
              </span>
            )}
            {approval && (
              <span className="flex items-center gap-0.5">
                <Badge tone="amber">asks first</Badge>
                <InfoTip id="approval" />
              </span>
            )}
          </div>
          <label htmlFor={id} className="mt-0.5 block cursor-pointer text-xs text-zinc-400">
            {description}
          </label>
          <div className="mt-1 flex items-center gap-3 text-xs">
            <button type="button" aria-expanded={showSchema} onClick={() => setShowSchema((v) => !v)} className="text-zinc-500 hover:text-zinc-300">
              {showSchema ? 'Hide schema' : 'Schema'}
            </button>
            {onEdit && (
              <button type="button" onClick={onEdit} className="text-zinc-500 hover:text-zinc-300">
                Edit
              </button>
            )}
          </div>
          {showSchema && (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                Input schema the model sees <InfoTip id="schema" />
              </div>
              <JsonView value={schema()} expandDepth={3} />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

const noDeps = {
  providerFor: () => Promise.reject(new Error('preview only')),
  toolsFor: () => Promise.resolve([]),
}

export function ToolPicker({ agentId, selected, onChange }: { agentId: string; selected: string[]; onChange: (names: string[]) => void }) {
  const custom = useLiveQuery(() => db.customTools.orderBy('name').toArray(), [], [])
  const others = useLiveQuery(() => db.agents.orderBy('name').filter((a) => a.id !== agentId).toArray(), [agentId], [])
  const [editing, setEditing] = useState<{ def: CustomToolDef; isNew: boolean } | null>(null)

  const toggle = (name: string, on: boolean) => onChange(on ? [...new Set([...selected, name])] : selected.filter((n) => n !== name))

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        <span className="font-mono text-zinc-300">{selected.length}</span> {selected.length === 1 ? 'tool' : 'tools'} enabled for this agent.
      </p>
      <section className="space-y-2">
        <SectionTitle tip="tools">Built-in tools</SectionTitle>
        <ul className="space-y-1.5">
          {BUILTIN_TOOLS.map((t) => (
            <ToolRow
              key={t.name}
              name={t.name}
              description={t.description}
              approval={!!t.requiresApproval}
              checked={selected.includes(t.name)}
              onToggle={(on) => toggle(t.name, on)}
              schema={() => toolInputSchema(t)}
            />
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <SectionTitle
          tip="customTools"
          action={
            <Button size="sm" variant="ghost" onClick={() => setEditing({ def: newCustomTool(), isNew: true })}>
              <Plus className="size-3.5" /> New tool
            </Button>
          }
        >
          Custom JS tools
        </SectionTitle>
        {custom.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Code className="size-3.5" /> Write a tool in JavaScript; it runs in a sandboxed worker.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {custom.map((d) => (
              <ToolRow
                key={d.id}
                name={d.name}
                description={d.description}
                approval={d.requiresApproval}
                checked={selected.includes(d.name)}
                onToggle={(on) => toggle(d.name, on)}
                schema={() => toolInputSchema(customToolToTool(d))}
                custom
                onEdit={() => setEditing({ def: d, isNew: false })}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle tip="agentTools">Agents as tools</SectionTitle>
        {others.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Bot className="size-3.5" /> Create another agent to let this one delegate work to it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {others.map((a) => (
              <ToolRow
                key={a.id}
                name={agentToolName(a.name)}
                agentName={a.name}
                description={a.systemPrompt.length > 160 ? `${a.systemPrompt.slice(0, 160)}…` : a.systemPrompt}
                approval={false}
                checked={selected.includes(agentRef(a.id))}
                onToggle={(on) => toggle(agentRef(a.id), on)}
                schema={() => toolInputSchema(agentAsTool(a, noDeps))}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && <CustomToolEditor key={editing.def.id} initial={editing.def} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  )
}
