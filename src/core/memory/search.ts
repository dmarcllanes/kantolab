// In-memory BM25 keyword search over user documents (MiniSearch). Documents
// are split into chunks so results point at a passage, not a whole file.
import MiniSearch from 'minisearch'
import type { DocumentRecord } from './db'

interface Chunk {
  id: string
  docId: string
  title: string
  text: string
}

export interface SearchHit {
  /** Chunk id. */
  id: string
  docId: string
  title: string
  text: string
  score: number
}

export function chunkText(text: string, target = 700): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > target) {
      chunks.push(current)
      current = ''
    }
    current = current ? `${current}\n\n${p}` : p
    while (current.length > target * 1.5) {
      chunks.push(current.slice(0, target))
      current = current.slice(target)
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export class DocumentIndex {
  private ms = new MiniSearch<Chunk>({
    fields: ['title', 'text'],
    storeFields: ['docId', 'title', 'text'],
    searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.2 },
  })
  private chunkIds = new Map<string, string[]>()

  add(doc: DocumentRecord): number {
    this.remove(doc.id)
    const chunks = chunkText(doc.text).map((text, i) => ({ id: `${doc.id}:${i}`, docId: doc.id, title: doc.title, text }))
    this.ms.addAll(chunks)
    this.chunkIds.set(doc.id, chunks.map((c) => c.id))
    return chunks.length
  }

  remove(docId: string): void {
    const ids = this.chunkIds.get(docId)
    if (!ids) return
    this.ms.discardAll(ids)
    this.chunkIds.delete(docId)
  }

  chunkCount(docId: string): number {
    return this.chunkIds.get(docId)?.length ?? 0
  }

  search(query: string, limit = 5): SearchHit[] {
    return this.ms
      .search(query)
      .slice(0, limit)
      .map((r) => ({ id: String(r.id), docId: String(r.docId), title: String(r.title), text: String(r.text), score: Math.round(r.score * 100) / 100 }))
  }
}

export const documentIndex = new DocumentIndex()
