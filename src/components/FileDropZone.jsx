import { useRef, useState } from 'react'
import Icon from './Icon.jsx'

// Reusable multi-file (or single-file) input: drag & drop or click to browse.
// Calls onFiles(File[]) with only the files matching `accept` extensions.
export default function FileDropZone({ onFiles, accept = ['.pdf'], multiple = true }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const acceptFiles = (fileList) => {
    const files = Array.from(fileList).filter((f) =>
      accept.some((ext) => f.name.toLowerCase().endsWith(ext)),
    )
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <div
      className={`dropzone ${dragOver ? 'dropzone-active' : ''}`}
      data-testid="dropzone"
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        acceptFiles(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        multiple={multiple}
        hidden
        onChange={(e) => {
          acceptFiles(e.target.files)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
      <span className="dropzone-icon" aria-hidden="true">
        <Icon name="extract" size={28} />
      </span>
      <p className="dropzone-title">
        {dragOver
          ? 'Release to add'
          : multiple
            ? 'Drop files here'
            : 'Drop a file here'}
      </p>
      <p className="dropzone-sub">
        or <span className="dropzone-link">browse</span>
      </p>
      <p className="dropzone-hint">
        {accept.map((a) => (
          <span key={a} className="ext-chip">
            {a.replace('.', '')}
          </span>
        ))}
      </p>
    </div>
  )
}
