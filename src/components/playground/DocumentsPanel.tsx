import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Search, Trash, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../core/memory/db'
import { addDocument, ensureDocumentIndex, MAX_DOCUMENT_BYTES, removeDocument } from '../../core/memory/documents'
import { documentIndex, type SearchHit } from '../../core/memory/search'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { SectionTitle } from '../ui/SectionTitle'

export function DocumentsPanel({ toolEnabled }: { toolEnabled: boolean }) {
  const docs = useLiveQuery(() => db.documents.orderBy('createdAt').reverse().toArray(), [], [])
  const [indexReady, setIndexReady] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void ensureDocumentIndex().then(() => setIndexReady(true))
  }, [])

  const upload = async (files: FileList) => {
    setProblem(null)
    for (const f of Array.from(files)) {
      if (f.size > MAX_DOCUMENT_BYTES) {
        setProblem(`${f.name} is over 5 MB; split it first.`)
        continue
      }
      await addDocument(f.name, await f.text())
    }
  }

  const addPasted = async () => {
    if (!text.trim()) return
    await addDocument(title || text.slice(0, 40), text)
    setTitle('')
    setText('')
  }

  return (
    <div className="space-y-4">
      <SectionTitle tip="documents">Documents · {docs.length}</SectionTitle>
      {!toolEnabled && (
        <p className="rounded bg-zinc-800/60 p-2 text-xs text-zinc-400">
          Enable <code className="font-mono">search_documents</code> in Tools so this agent can read these.
        </p>
      )}
      <p className="text-xs text-zinc-500">Documents are stored in this browser (IndexedDB) and searched in memory with BM25. Nothing is uploaded.</p>

      <div className="flex gap-2">
        <Button onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" /> Add text files
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.json,.html,text/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <details className="rounded-md border border-zinc-800 p-2">
        <summary className="cursor-pointer text-sm text-zinc-300">Paste text instead</summary>
        <div className="mt-2 space-y-2">
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          <textarea placeholder="Paste text…" value={text} onChange={(e) => setText(e.target.value)} rows={5} className={inputClass} />
          <Button size="sm" onClick={() => void addPasted()} disabled={!text.trim()}>
            Add document
          </Button>
        </div>
      </details>

      {problem && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}

      <ul className="space-y-1">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-md border border-zinc-800 px-2 py-1.5">
            <FileText className="size-3.5 shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
            <span className="text-xs text-zinc-500">
              {(d.text.length / 1000).toFixed(1)}k chars{indexReady && ` · ${documentIndex.chunkCount(d.id)} chunk${documentIndex.chunkCount(d.id) === 1 ? '' : 's'}`}
            </span>
            <button type="button" aria-label={`Remove ${d.title}`} onClick={() => void removeDocument(d.id)} className="rounded p-1 text-zinc-500 hover:text-red-300">
              <Trash className="size-3.5" />
            </button>
          </li>
        ))}
        {docs.length === 0 && <li className="text-xs text-zinc-500">No documents yet.</li>}
      </ul>

      {docs.length > 0 && (
        <div className="space-y-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (query.trim()) setHits(documentIndex.search(query, 5))
            }}
          >
            <input placeholder="Try a search…" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} />
            <Button type="submit" disabled={!indexReady}>
              <Search className="size-4" />
            </Button>
          </form>
          {hits && (
            <ul className="space-y-1.5">
              {hits.length === 0 && <li className="text-xs text-zinc-500">No matches.</li>}
              {hits.map((h) => (
                <li key={h.id} className="rounded-md bg-zinc-900 p-2 text-xs">
                  <div className="text-zinc-400">
                    {h.title} · score {h.score}
                  </div>
                  <p className="mt-1 line-clamp-3 text-zinc-300">{h.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
