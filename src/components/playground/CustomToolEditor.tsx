import { Plus, Trash } from 'lucide-react'
import { useState } from 'react'
import { customToolToTool, saveCustomTool, TOOL_NAME_PATTERN, type CustomToolDef, type ParamType } from '../../core/tools/custom'
import { BUILTIN_TOOL_NAMES } from '../../core/tools/registry'
import { invokeTool, toolInputSchema, type ToolResult } from '../../core/tools/types'
import { db } from '../../core/memory/db'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { JsonView } from '../ui/JsonView'
import { InfoTip } from '../ui/InfoTip'
import { Modal } from '../ui/Modal'

export function CustomToolEditor({ initial, isNew, onClose }: { initial: CustomToolDef; isNew: boolean; onClose: () => void }) {
  const [def, setDef] = useState(initial)
  const [testInput, setTestInput] = useState(() =>
    JSON.stringify(Object.fromEntries(initial.params.map((p) => [p.name, p.type === 'number' ? 1 : p.type === 'boolean' ? true : 'hello'])), null, 2),
  )
  const [testResult, setTestResult] = useState<ToolResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const patch = (p: Partial<CustomToolDef>) => setDef((d) => ({ ...d, ...p }))
  const setParam = (i: number, p: Partial<CustomToolDef['params'][number]>) =>
    patch({ params: def.params.map((x, j) => (j === i ? { ...x, ...p } : x)) })

  const validate = async (): Promise<string | null> => {
    if (!TOOL_NAME_PATTERN.test(def.name)) return 'Name must be snake_case: a–z, 0–9, _ (2–40 chars, starting with a letter).'
    if (BUILTIN_TOOL_NAMES.has(def.name)) return `"${def.name}" is a built-in tool name.`
    const clash = await db.customTools.where('name').equals(def.name).first()
    if (clash && clash.id !== def.id) return `Another custom tool is already called "${def.name}".`
    const names = def.params.map((p) => p.name)
    if (names.some((n) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n))) return 'Parameter names must be identifiers (letters, digits, _).'
    if (new Set(names).size !== names.length) return 'Parameter names must be unique.'
    if (!def.description.trim()) return 'Add a description so the model knows when to use it.'
    return null
  }

  const save = async () => {
    const err = await validate()
    setProblem(err)
    if (err) return
    await saveCustomTool(def, isNew ? undefined : initial.name)
    onClose()
  }

  const test = async () => {
    let args: unknown
    try {
      args = JSON.parse(testInput)
    } catch {
      setTestResult({ ok: false, stage: 'input', error: 'Test input is not valid JSON.' })
      return
    }
    setTesting(true)
    setTestResult(await invokeTool(customToolToTool(def), args))
    setTesting(false)
  }

  const remove = async () => {
    if (!confirm(`Delete tool "${initial.name}"?`)) return
    await db.customTools.delete(def.id)
    onClose()
  }

  let schema: unknown = null
  try {
    schema = toolInputSchema(customToolToTool(def))
  } catch {
    schema = null
  }

  return (
    <Modal title={isNew ? 'New custom tool' : `Edit ${initial.name}`} onClose={onClose} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Name">
            <input value={def.name} onChange={(e) => patch({ name: e.target.value })} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Description (shown to the model)">
            <textarea value={def.description} onChange={(e) => patch({ description: e.target.value })} rows={3} className={inputClass} />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-medium text-zinc-400">
                Parameters <InfoTip id="params" />
              </span>
              <Button size="sm" variant="ghost" onClick={() => patch({ params: [...def.params, { id: crypto.randomUUID(), name: `param${def.params.length + 1}`, type: 'string', description: '', required: true }] })}>
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            {def.params.map((p, i) => (
              <div key={p.id} className="space-y-1.5 rounded-md border border-zinc-800 p-2">
                <div className="flex gap-1.5">
                  <input aria-label="Parameter name" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} className={`${inputClass} font-mono`} />
                  <select aria-label="Parameter type" value={p.type} onChange={(e) => setParam(i, { type: e.target.value as ParamType })} className={`${inputClass} w-28`}>
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <button type="button" aria-label="Remove parameter" onClick={() => patch({ params: def.params.filter((_, j) => j !== i) })} className="rounded p-1 text-zinc-500 hover:text-red-300">
                    <Trash className="size-3.5" />
                  </button>
                </div>
                <input aria-label="Parameter description" placeholder="Description" value={p.description} onChange={(e) => setParam(i, { description: e.target.value })} className={inputClass} />
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={p.required} onChange={(e) => setParam(i, { required: e.target.checked })} /> required
                </label>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={def.requiresApproval} onChange={(e) => patch({ requiresApproval: e.target.checked })} />
                Ask before running
              </label>
              <InfoTip id="approval" />
            </span>
            <label className="flex items-center gap-2">
              Timeout
              <input type="number" min={100} max={60000} step={100} value={def.timeoutMs} onChange={(e) => patch({ timeoutMs: Number(e.target.value) || 5000 })} className={`${inputClass} w-24`} />
              ms
            </label>
            <InfoTip id="timeout" />
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Code — body of async (input) => { … }" tip="sandbox" hint="Runs in an isolated worker with no network or storage access. Return JSON-serialisable data.">
            <textarea value={def.code} onChange={(e) => patch({ code: e.target.value })} rows={9} spellCheck={false} className={`${inputClass} font-mono text-xs`} />
          </Field>
          <Field label="Test input (JSON)">
            <textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} rows={3} spellCheck={false} className={`${inputClass} font-mono text-xs`} />
          </Field>
          <Button size="sm" onClick={() => void test()} disabled={testing}>
            {testing ? 'Running…' : 'Run test'}
          </Button>
          {testResult && <JsonView value={testResult} expandDepth={3} />}
          {schema !== null && (
            <details className="text-xs text-zinc-400">
              <summary className="cursor-pointer">Input JSON Schema sent to the model</summary>
              <div className="mt-1">
                <JsonView value={schema} />
              </div>
            </details>
          )}
        </div>
      </div>

      {problem && <p className="mt-3 rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={() => void save()}>
          Save tool
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {!isNew && (
          <Button variant="danger" className="ml-auto" onClick={() => void remove()}>
            Delete
          </Button>
        )}
      </div>
    </Modal>
  )
}
