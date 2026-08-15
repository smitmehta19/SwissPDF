import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'

let nextId = 1

// Shared file-list state for every tool: add files (validated + page-counted),
// reorder, remove. Bytes are read once and cached on the item.
export function usePdfFiles() {
  const [items, setItems] = useState([]) // { id, file, bytes, pageCount, error }

  const addFiles = async (files) => {
    const newItems = files.map((file) => ({
      id: nextId++,
      file,
      bytes: null,
      pageCount: null,
      error: null,
    }))
    setItems((prev) => [...prev, ...newItems])
    for (const item of newItems) {
      try {
        const bytes = await item.file.arrayBuffer()
        const doc = await PDFDocument.load(bytes)
        const pageCount = doc.getPageCount()
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, bytes, pageCount } : it)),
        )
      } catch (err) {
        const error = /encrypted/i.test(String(err))
          ? 'Password-protected — unlock it first'
          : 'Not a valid PDF'
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, error } : it)))
      }
    }
  }

  const move = (index, delta) => {
    setItems((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // Drag-and-drop reordering: move the item at `from` to position `to`.
  const reorder = (from, to) => {
    setItems((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const remove = (id) => setItems((prev) => prev.filter((it) => it.id !== id))
  const clear = () => setItems([])

  const validItems = items.filter((it) => !it.error && it.pageCount !== null)
  return { items, validItems, addFiles, move, reorder, remove, clear }
}

export function baseName(filename) {
  return filename.replace(/\.pdf$/i, '')
}
