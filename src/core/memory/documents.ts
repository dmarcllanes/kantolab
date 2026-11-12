import { db, type DocumentRecord } from './db'
import { documentIndex } from './search'

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

let ready: Promise<void> | null = null

/** Build the in-memory index from IndexedDB once per page load. */
export function ensureDocumentIndex(): Promise<void> {
  ready ??= db.documents.toArray().then((docs) => {
    for (const d of docs) documentIndex.add(d)
  })
  return ready
}

export async function addDocument(title: string, text: string): Promise<DocumentRecord> {
  await ensureDocumentIndex()
  const doc: DocumentRecord = { id: crypto.randomUUID(), title: title.trim() || 'Untitled', text, createdAt: Date.now() }
  await db.documents.add(doc)
  documentIndex.add(doc)
  return doc
}

export async function removeDocument(id: string): Promise<void> {
  await db.documents.delete(id)
  documentIndex.remove(id)
}
