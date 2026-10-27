import Icon from '../../components/Icon.jsx'
import './g2.css'

// Number of checks in runSelfTest, for the progress bar before the first run.
const EXPECTED = 49

function Options() {
  return (
    <>
      <p className="field-help">
        Makes test documents from scratch inside this browser, runs every SwissPDF operation on them and reads the results back. Run it any time you want
        proof that everything still works on this device.
      </p>
      <p className="field-help">It does not use your files and nothing is uploaded. The first run loads the PDF, OCR and Office engines, which takes a minute.</p>
    </>
  )
}

function HealthView({ view }) {
  const { results } = view
  const failed = results.filter((r) => !r.pass)
  return (
    <section className="g2-health" aria-label="Health check results">
      <p className={`notice ${failed.length ? 'notice-error' : 'notice-ok'}`} data-testid="health-summary" role="status">
        {failed.length === 0
          ? `All ${results.length} checks passed. Every tool works in this browser.`
          : `${failed.length} of ${results.length} checks failed. The tools affected are marked below.`}
      </p>
      <ul className="g2-checks" data-testid="health-results">
        {results.map((r) => (
          <li key={r.name} className={r.pass ? 'check-pass' : 'check-fail'}>
            <span className="g2-check-mark" aria-label={r.pass ? 'Passed' : 'Failed'}>
              <Icon name={r.pass ? 'check' : 'close'} size={14} />
            </span>
            <span className="check-name">{r.name}</span>
            <span className="check-detail">{r.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default {
  id: 'health',
  name: 'Health check',
  io: 'self-test',
  description: 'Verify every tool in this browser.',
  category: 'System',
  icon: 'health',
  accepts: { min: 0 },
  defaults: {},
  next: [],
  Options,
  summary() {
    return { ready: true, line: 'About 50 checks run on generated test files.', runLabel: 'Run health check' }
  },
  async run(_files, _o, ctx) {
    const { runSelfTest } = await import('../../lib/selfTest.js')
    let n = 0
    const results = await runSelfTest((name) => {
      ctx.check()
      ctx.progress(n, Math.max(EXPECTED, n + 1), name)
      n++
    })
    ctx.check()
    return { outputs: [], view: { results } }
  },
  Result: HealthView,
}
