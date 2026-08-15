import { useEffect, useRef, useState } from 'react'
import { normalizeImage } from '../lib/imageOps.js'

let nextId = 1

// File-list state for image inputs: validated + normalized to JPEG/PNG,
// with an object URL for instant previews. Same shape as usePdfFiles.
export function useImageFiles() {
  // { id, file, imageUrl, normalized: {bytes,type,width,height}, error }
  const [items, setItems] = useState([])
  const urlsRef = useRef([])

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    },
    [],
  )

  const addFiles = async (files) => {
    const newItems = files.map((file) => {
      const imageUrl = URL.createObjectURL(file)
      urlsRef.current.push(imageUrl)
      return { id: nextId++, file, imageUrl, normalized: null, error: null }
    })
    setItems((prev) => [...prev, ...newItems])
    for (const item of newItems) {
      try {
        const normalized = await normalizeImage(await item.file.arrayBuffer())
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, normalized } : it)))
      } catch (err) {
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, error: err.message } : it)),
        )
      }
    }
  }

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

  const validItems = items.filter((it) => !it.error && it.normalized !== null)
  return { items, validItems, addFiles, reorder, remove }
}
