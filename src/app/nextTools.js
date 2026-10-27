// "Edit your new file" suggestions after a run: the tool's own `next` list
// first, then common follow-ups for its category, 4 at most.
const BY_CATEGORY = {
  Organize: ['compress', 'merge', 'split', 'pagenumbers'],
  Convert: ['compress', 'merge', 'ocr', 'protect'],
  Optimize: ['protect', 'split', 'ocr', 'merge'],
  Edit: ['compress', 'protect', 'merge', 'split'],
  Security: ['compress', 'merge', 'split', 'protect'],
  System: ['repair', 'compress', 'merge', 'split'],
}
const FALLBACK = ['compress', 'merge', 'split', 'protect']

// The tools most people come for: a "Popular" group in the tool list and
// tiles on the home screen.
export const POPULAR = ['merge', 'compress', 'split', 'protect', 'pdf2word', 'redact']

export function suggestNext(tool, tools, max = 4) {
  if (!tool) return []
  const ids = [...(tool.next ?? []), ...(BY_CATEGORY[tool.category] ?? []), ...FALLBACK]
  const out = []
  for (const id of ids) {
    if (id === tool.id || out.some((t) => t.id === id)) continue
    const t = tools.find((x) => x.id === id)
    // only tools that run on the workspace can take the result
    if (t && typeof t.run === 'function') out.push(t)
    if (out.length >= max) break
  }
  return out
}

// Run label with its scope: tools that already count ("Merge 3 PDFs") keep
// their label; the rest get the file count ("Repair (1 file)").
export function scopedRunLabel(label, ready, count) {
  if (!ready || !count || /\d/.test(label ?? '')) return label
  return `${label} (${count} file${count === 1 ? '' : 's'})`
}
