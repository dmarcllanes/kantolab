// Collapsible JSON tree. Collapsed past the first level to keep traces light.

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-zinc-500">null</span>
  if (typeof value === 'string') return <span className="break-all whitespace-pre-wrap text-amber-200">"{value}"</span>
  if (typeof value === 'number') return <span className="text-sky-300">{value}</span>
  if (typeof value === 'boolean') return <span className="text-violet-300">{String(value)}</span>
  return <span className="text-zinc-500">{String(value)}</span>
}

function Node({ name, value, depth, expandDepth }: { name?: string; value: unknown; depth: number; expandDepth: number }) {
  const label = name !== undefined && <span className="text-zinc-400">{name}: </span>
  if (value === null || typeof value !== 'object') {
    return (
      <div className="pl-4">
        {label}
        <Primitive value={value} />
      </div>
    )
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`
  return (
    <details open={depth < expandDepth} className="pl-4">
      <summary className="cursor-pointer list-inside text-zinc-300 marker:text-zinc-600">
        {label}
        <span className="text-zinc-500">{summary}</span>
      </summary>
      {entries.map(([k, v]) => (
        <Node key={k} name={k} value={v} depth={depth + 1} expandDepth={expandDepth} />
      ))}
    </details>
  )
}

/** expandDepth: how many levels start open (default 1 keeps traces compact). */
export function JsonView({ value, expandDepth = 1 }: { value: unknown; expandDepth?: number }) {
  return (
    <div className="-ml-4 overflow-x-auto rounded bg-zinc-950 py-1.5 pr-2 font-mono text-xs leading-5">
      <Node value={value} depth={0} expandDepth={expandDepth} />
    </div>
  )
}
