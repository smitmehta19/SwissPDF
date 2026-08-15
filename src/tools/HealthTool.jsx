import { useState } from 'react'
import { runSelfTest } from '../lib/selfTest.js'

// Runs the full self-test suite in THIS browser: generates known PDFs,
// exercises every core operation, and reads the outputs back to verify them.
export default function HealthTool() {
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState('')

  const run = async () => {
    setRunning(true)
    setResults(null)
    try {
      setResults(await runSelfTest(setCurrent))
    } finally {
      setRunning(false)
    }
  }

  const failed = results?.filter((r) => !r.pass) ?? []

  return (
    <div className="tool-body">
      <p className="option-help">
        Generates test documents from scratch inside your browser, runs every SwissPDF
        operation on them, and verifies the actual output content. Run this any time you
        want proof that everything still works on this device — nothing is uploaded.
      </p>
      <div className="action-bar">
        <button className="primary-btn" data-testid="health-run-btn" onClick={run} disabled={running}>
          {running ? `Running: ${current}…` : 'Run health check'}
        </button>
      </div>

      {results && (
        <>
          <p
            className={`status ${failed.length === 0 ? 'status-ok' : 'status-error'}`}
            data-testid="health-summary"
          >
            {failed.length === 0
              ? `All ${results.length} checks passed — every tool is working correctly in this browser.`
              : `${failed.length} of ${results.length} checks FAILED — the affected tools are listed below.`}
          </p>
          <ul className="check-list" data-testid="health-results">
            {results.map((r) => (
              <li key={r.name} className={`check-row ${r.pass ? 'check-pass' : 'check-fail'}`}>
                <span className="check-mark">{r.pass ? '✔' : '✘'}</span>
                <span className="check-name">{r.name}</span>
                <span className="check-detail">{r.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
