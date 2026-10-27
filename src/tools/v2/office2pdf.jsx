// Word, Excel and PowerPoint to PDF. High fidelity (LibreOffice in WASM) is
// the default; Quick renders pages as pictures without the engine download.
// The engine is never downloaded silently: until it is on this device the
// options show a "Download engine" prompt and the Run label says so.
import { useEffect, useState } from 'react'
import { OptionCards } from '../../app/controls.jsx'
import { ENGINE_BUILD, engineAvailable, engineLoaded, loadEngine } from '../../lib/libreOffice.js'
import { loadOfficeEngine, officeEngineCached, plural, stem } from './convertShared.js'

const KINDS = {
  word: {
    id: 'word2pdf',
    name: 'Word to PDF',
    io: 'DOC/DOCX → PDF',
    description: 'True layout, selectable text.',
    icon: 'word',
    types: ['.docx', '.doc', '.odt', '.rtf', '.txt'],
    noun: 'Word documents',
    quick: /\.docx$/i,
    quickFn: 'docxToPdf',
  },
  excel: {
    id: 'excel2pdf',
    name: 'Excel to PDF',
    io: 'XLS/XLSX → PDF',
    description: 'Sheets laid out as printed pages.',
    icon: 'excel',
    types: ['.xlsx', '.xls', '.ods', '.csv'],
    noun: 'spreadsheets',
    quick: /\.(xlsx|xls|csv)$/i,
    quickFn: 'xlsxToPdf',
  },
  ppt: {
    id: 'ppt2pdf',
    name: 'PowerPoint to PDF',
    io: 'PPT/PPTX → PDF',
    description: 'One page per slide.',
    icon: 'ppt',
    types: ['.pptx', '.ppt', '.odp'],
    noun: 'presentations',
    quick: /\.pptx$/i,
    quickFn: 'pptxToPdf',
  },
}

const QUICK_NOTE = 'Quick mode: pages are pictures, text is not selectable.'
export const QUICK_TITLE = 'Quick (text becomes images)'

// true once the engine runs or sits in the cache: no download on Run.
// Kept in options (engineReady) so summary() sees it.
export const engineReady = (options) => engineLoaded() || options.engineReady === true

// Checks the cache once per panel and stores the answer in options.
export function useEngineReady(options, setOptions) {
  useEffect(() => {
    let live = true
    officeEngineCached().then((ok) => {
      if (live && ok !== options.engineReady) setOptions((o) => ({ ...o, engineReady: ok }))
    })
    return () => {
      live = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

// First-use prompt: download the engine now, or use Quick instead.
export function EngineDownload({ options, setOptions, quickOk = true }) {
  const [state, setState] = useState(null) // null | { percent, starting } | { error }
  if (!engineAvailable() || options.engine !== 'hifi' || engineReady(options)) return null
  const mb = ENGINE_BUILD.downloadMB
  const download = async () => {
    setState({ percent: 0 })
    try {
      await loadEngine((msg, info) => {
        if (info?.phase === 'download') setState({ percent: info.percent })
        else if (info?.phase === 'start') setState({ percent: 100, starting: true })
      })
      setState(null)
      setOptions((o) => ({ ...o, engineReady: true }))
    } catch (err) {
      setState({ error: err.message })
    }
  }
  const busy = state && !state.error
  return (
    <div className="notice engine-prompt" data-testid="engine-prompt">
      <p>
        <strong>Download engine (about {mb} MB)</strong>
      </p>
      <p>High fidelity needs the Office engine once, from cdn.zetaoffice.net. Each file is checked against a fixed fingerprint before it runs, and it stays on this device after that. Your files are not uploaded.</p>
      {state?.error && (
        <p className="notice-error" role="alert">
          {state.error}
        </p>
      )}
      {busy ? (
        <p role="status" className="mono">
          {state.starting ? 'Starting the engine' : `Downloading ${state.percent}%`}
        </p>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn-small" onClick={download} data-testid="engine-download">
            Download engine
          </button>
          {quickOk && (
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => setOptions((o) => ({ ...o, engine: 'quick' }))}
              data-testid="engine-use-quick"
            >
              Use {QUICK_TITLE}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function makeOptions(kind) {
  return function Options({ options, setOptions }) {
    useEngineReady(options, setOptions)
    const canHiFi = engineAvailable()
    const ready = engineReady(options)
    const quickExt = kind.quick.source.replace(/[^a-z|]/g, '').split('|').map((e) => e.toUpperCase()).join(', ')
    return (
      <>
        <OptionCards
          label="Engine"
          testId="office-engine"
          value={options.engine}
          onChange={(engine) => setOptions({ ...options, engine })}
          options={[
            {
              value: 'hifi',
              title: 'High fidelity',
              caption: ready
                ? 'True layout and selectable text. The engine is on this device.'
                : `True layout and selectable text. Needs the Office engine once (about ${ENGINE_BUILD.downloadMB} MB, kept after).`,
            },
            { value: 'quick', title: QUICK_TITLE, caption: `No download. Pages become pictures, text is not selectable. ${quickExt} only.` },
          ]}
        />
        <EngineDownload options={options} setOptions={setOptions} />
        {!canHiFi && options.engine === 'hifi' && (
          <p className="notice notice-warn" role="status">
            This tab cannot run the Office engine, so Quick mode is used instead.
          </p>
        )}
        <p className="field-help">The engine runs in this browser and is checked against a fixed fingerprint. Only engine files are downloaded; your documents stay here.</p>
      </>
    )
  }
}

function makeTool(kind) {
  return {
    id: kind.id,
    name: kind.name,
    io: kind.io,
    description: kind.description,
    category: 'Convert',
    icon: kind.icon,
    accepts: { min: 1, types: kind.types, noun: kind.noun },
    defaults: { engine: 'hifi' },
    next: ['compress', 'merge', 'watermark', 'protect'],
    Options: makeOptions(kind),
    summary(files, options) {
      const n = files.length
      if (n === 0) return { ready: false, line: `Select at least 1 file (${kind.types.join(' ')}).`, runLabel: 'Convert to PDF' }
      const quick = options.engine === 'quick' || !engineAvailable()
      const bad = quick ? files.filter((f) => !kind.quick.test(f.name)).length : 0
      if (bad === n) return { ready: false, line: 'Quick mode cannot read these files. Use High fidelity.', runLabel: 'Convert to PDF' }
      const skip = bad ? ` ${plural(bad, 'file')} will be skipped: Quick mode cannot read ${bad === 1 ? 'it' : 'them'}.` : ''
      if (!quick && !engineReady(options)) {
        const mb = ENGINE_BUILD.downloadMB
        return { ready: true, line: `${plural(n, 'PDF')} will be created. The Office engine downloads first, once (about ${mb} MB).`, runLabel: `Download engine (${mb} MB) and convert` }
      }
      return { ready: true, line: `${plural(n - bad, 'PDF')} will be created.${skip}`, runLabel: `Convert ${plural(n - bad, 'file')}` }
    },
    async run(files, options, ctx) {
      let quick = options.engine === 'quick'
      let fallback = null
      if (!quick && !engineAvailable()) {
        quick = true
        fallback = 'The Office engine cannot run in this tab, Quick mode was used.'
      }
      const lo = quick ? null : await loadOfficeEngine(ctx)
      const office = quick ? await import('../../lib/officeOps.js') : null
      const outputs = []
      const failed = []
      for (const [i, f] of files.entries()) {
        ctx.check()
        ctx.progress(i, files.length, `Converting ${f.name}`)
        if (quick && !kind.quick.test(f.name)) {
          failed.push(`${f.name} (Quick mode cannot read this type)`)
          continue
        }
        try {
          const onProgress = (msg) => {
            ctx.check()
            if (typeof msg === 'string') ctx.progress(i, files.length, `${f.name}: ${msg}`)
          }
          const bytes = quick
            ? await office[kind.quickFn](f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength), onProgress)
            : await lo.convertToPdfHiFi(f.bytes, f.name, onProgress, { signal: ctx.signal })
          outputs.push({ name: `${stem(f.name)}.pdf`, bytes, parentIds: [f.id], note: quick ? (fallback ?? QUICK_NOTE) : null })
        } catch (err) {
          if (err?.cancelled) throw err
          failed.push(`${f.name} (${err.message})`)
        }
      }
      if (outputs.length === 0) throw new Error(failed.join('; '))
      if (failed.length) outputs[0].note = [outputs[0].note, `Not converted: ${failed.join('; ')}`].filter(Boolean).join(' ')
      ctx.progress(files.length, files.length, 'Done')
      return outputs
    },
  }
}

export const word2pdf = makeTool(KINDS.word)
export const excel2pdf = makeTool(KINDS.excel)
export const ppt2pdf = makeTool(KINDS.ppt)
