import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-zinc-800`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xl text-zinc-100">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-500/10 hover:text-zinc-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-4 pb-5">{children}</div>
      </div>
    </div>
  )
}
