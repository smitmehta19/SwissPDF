// Closes leftovers of earlier test runs: browsers that test scripts launched
// (temp playwright profiles, headless shells) and this repo's test servers
// (vite, serve-pages-sim, corpus scripts). Never touches the user's own
// browser or the Playwright MCP browser. Refuses while a run holds the lock.
//   npm run test:clean            list, then close
//   npm run test:clean -- --dry   list only
//   npm run test:clean -- --force also when the lock is held
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { LOCK_FILE, lockHolder } from './runlock.mjs'

const dry = process.argv.includes('--dry')
const force = process.argv.includes('--force')
const holder = lockHolder()
if (holder && !force) {
  console.log(`A test run is active: ${holder.label} (pid ${holder.pid}, since ${holder.started}). Nothing closed. Use --force if it is a leftover.`)
  process.exit(1)
}

function processes() {
  if (process.platform === 'win32') {
    const ps = "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(chrome|chromium|headless_shell|node)\\.exe$' } | ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.CommandLine)\" }"
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 << 20 })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        const [pid, ppid, name, ...cmd] = l.split('\t')
        return { pid: Number(pid), ppid: Number(ppid), name, cmd: cmd.join('\t') }
      })
  }
  return execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l)
      return m && { pid: Number(m[1]), ppid: Number(m[2]), name: m[3], cmd: m[4] }
    })
    .filter(Boolean)
}

const all = processes()
const isTestBrowser = (p) => /chrom|headless_shell/i.test(p.name) && /playwright_chromiumdev_profile|headless_shell/i.test(p.cmd) && !/--type=/.test(p.cmd)
const isTestServer = (p) =>
  /node/i.test(p.name) && p.pid !== process.pid && /(serve-pages-sim\.mjs|corpus-test[\\/][\w-]+\.mjs|vite[\\/]bin|test:corpus)/i.test(p.cmd) && !/clean\.mjs/.test(p.cmd)
const targets = all.filter((p) => isTestBrowser(p) || isTestServer(p))

if (!targets.length) console.log('No leftover test browsers or servers.')
for (const p of targets) console.log(`${dry ? 'would close' : 'closing'} ${p.pid} ${p.name} ${p.cmd.replace(/\s+/g, ' ').slice(0, 120)}`)
if (!dry) {
  for (const p of targets) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
      else process.kill(p.pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  if (holder && force) rmSync(LOCK_FILE, { force: true })
}
