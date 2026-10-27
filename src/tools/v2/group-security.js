// G2 Optimize + Security tools on the tool contract, in registry order.
// The orchestrator lists them in registry.js.
import repair from './repair.jsx'
import ocr from './ocr.jsx'
import compare from './compare.jsx'
import protect from './protect.jsx'
import unlock from './unlock.jsx'
import health from './health.jsx'
import autorotate from './autorotate.jsx'

export default [repair, ocr, compare, protect, unlock, health, autorotate]
