import { useRef, useState } from 'react'
import { normalizePdf } from '../lib/intake.js'
import { releasePdf } from '../lib/pdfText.js'

let nextId = 1

// Shared file-list state for every tool: add files (normalized + page-counted),
// reorder, remove. Restricted or damaged files are unlocked/repaired at intake;
// files with an open password wait for submitPassword. item.bytes is always
// the normalized copy the tools should work on.
export function usePdfFiles() {
  // { id, file, bytes, pageCount, error, errorDetails, notices, needsPassword,
  //   passwordError, unlocking, submitPassword(pw) (only while locked) }
  const [items, setItems] = useState([])
  // Original bytes of files still waiting for a password.
  const lockedRef = useRef(new Map())

  const patch = (id, fields) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...fields } : it)))

  const applyResult = (id, result) =>
    patch(id, {
      bytes: result.bytes,
      pageCount: result.pageCount,
      notices: result.notices,
      needsPassword: false,
      passwordError: null,
      unlocking: false,
      submitPassword: undefined,
    })

  const addFiles = async (files) => {
    const newItems = files.map((file) => ({
      id: nextId++,
      file,
      bytes: null,
      pageCount: null,
      error: null,
      errorDetails: null,
      notices: [],
      needsPassword: false,
      passwordError: null,
      unlocking: false,
    }))
    setItems((prev) => [...prev, ...newItems])
    for (const item of newItems) {
      let raw = null
      try {
        raw = new Uint8Array(await item.file.arrayBuffer())
        applyResult(item.id, await normalizePdf(raw))
      } catch (err) {
        if (err.code === 'NEEDS_PASSWORD') {
          lockedRef.current.set(item.id, raw)
          // Carried on the item so FileGroups can prompt without every tool
          // wiring a new prop. Uses only stable setters, so no stale state.
          patch(item.id, { needsPassword: true, submitPassword: (pw) => submitPassword(item.id, pw) })
        } else {
          patch(item.id, { error: err.message || 'Not a valid PDF', errorDetails: err.details ?? String(err) })
        }
      }
    }
  }

  const submitPassword = async (id, password) => {
    const raw = lockedRef.current.get(id)
    if (!raw || !password) return
    patch(id, { unlocking: true, passwordError: null })
    try {
      const result = await normalizePdf(raw, { password })
      lockedRef.current.delete(id)
      applyResult(id, result)
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD' || err.code === 'NEEDS_PASSWORD') {
        patch(id, { unlocking: false, passwordError: 'Wrong password, try again.' })
      } else {
        lockedRef.current.delete(id)
        patch(id, {
          unlocking: false,
          needsPassword: false,
          submitPassword: undefined,
          error: err.message || 'Not a valid PDF',
          errorDetails: err.details ?? String(err),
        })
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

  const remove = (id) => {
    lockedRef.current.delete(id)
    setItems((prev) => {
      const gone = prev.find((it) => it.id === id)
      if (gone?.bytes) releasePdf(gone.bytes)
      return prev.filter((it) => it.id !== id)
    })
  }
  const clear = () => {
    lockedRef.current.clear()
    setItems((prev) => {
      prev.forEach((it) => it.bytes && releasePdf(it.bytes))
      return []
    })
  }

  const validItems = items.filter((it) => !it.error && !it.needsPassword && it.pageCount !== null)
  return { items, validItems, addFiles, submitPassword, move, reorder, remove, clear }
}

export function baseName(filename) {
  return filename.replace(/\.pdf$/i, '')
}
