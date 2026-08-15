import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import FileDropZone from './FileDropZone.jsx'
import { formatBytes } from '../lib/download.js'

let nextId = 1

// Shared multi/single-file PDF picker with validation and page counts.
// Renders the drop zone + file list; hands validated items to `children`
// (a render function receiving the array of valid items).
export function usePdfFiles({ multiple = true } = {}) {
  const [items, setItems] = useState([])

  const addFiles = async (files) => {
    const newItems = files.map((file) => ({ id: nextId++, file, pageCount: null, error: null }))
    setItems((prev) => (multiple ? [...prev, ...newItems] : newItems))
    for (const item of newItems) {
      try {
        const doc = await PDFDocument.load(await item.file.arrayBuffer())
        const pageCount = doc.getPageCount()
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, pageCount } : it)))
      } catch (err) {
        const error = /encrypted/i.test(String(err))
          ? 'Password-protected — unlock it first'
          : 'Not a valid PDF'
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, error } : it)))
      }
    }
  }

  const remove = (id) => setItems((prev) => prev.filter((it) => it.id !== id))
  const validItems = items.filter((it) => !it.error && it.pageCount !== null)
  return { items, validItems, addFiles, remove, setItems }
}

export function PdfFileList({ items, onRemove }) {
  if (items.length === 0) return null
  return (
    <ul className="file-list" data-testid="file-list">
      {items.map((item, i) => (
        <li key={item.id} className={`file-row ${item.error ? 'file-row-error' : ''}`}>
          <span className="file-order">{i + 1}</span>
          <span className="file-name" title={item.file.name}>
            {item.file.name}
          </span>
          <span className="file-meta">
            {item.error
              ? item.error
              : item.pageCount === null
                ? 'Reading…'
                : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'} · ${formatBytes(item.file.size)}`}
          </span>
          <span className="file-actions">
            <button onClick={() => onRemove(item.id)} title="Remove">
              ✕
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

export { FileDropZone }
