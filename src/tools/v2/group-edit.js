// Edit-group tools on the tool contract (docs/design/tool-contract.md), with
// their page canvas in the viewer. The orchestrator lists them in registry.js.
import edit from './edit.jsx'
import forms from './forms.jsx'
import pagenumbers from './pagenumbers.jsx'
import crop from './crop.jsx'
import redact from './redact.jsx'
import sign from './sign.jsx'

export default [edit, forms, pagenumbers, crop, redact, sign]
