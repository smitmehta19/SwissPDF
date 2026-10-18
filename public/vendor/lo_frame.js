// Runs inside the hidden engine frame (lo_frame.html). The parent page fetches
// and checks the engine files, then calls window.loBoot() with them. Plain JS,
// no bundler.
import { ZetaHelperMain } from './zetajs/zetaHelper.js'

// cfg: { threadJs, base, sofficeJs: Blob, urls: { name: blob url }, wasm, data,
//        fonts: [{ path, bytes }] }
// Resolves with { thrPort, FS } once the office thread is up.
window.loBoot = (cfg) =>
  new Promise((resolve, reject) => {
    const zHM = new ZetaHelperMain(cfg.threadJs, {
      threadJsType: 'module',
      wasmPkg: 'url:' + cfg.base,
      blockPageScroll: false,
      sofficeJs: cfg.sofficeJs,
    })
    const M = zHM.Module
    // Only checked copies are used: the blob URLs, never the CDN directly.
    M.locateFile = (path) => cfg.urls[path] ?? cfg.base + path
    M.instantiateWasm = (imports, receive) => {
      const wasm = cfg.wasm
      cfg.wasm = null
      WebAssembly.instantiate(wasm, imports).then(
        (r) => receive(r.instance, r.module),
        (err) => reject(new Error('LibreOffice engine failed to start: ' + (err?.message ?? err))),
      )
      return {}
    }
    M.getPreloadedPackage = () => {
      const data = cfg.data
      cfg.data = null
      return data
    }
    // Extra fonts go in before LibreOffice builds its font list.
    M.preRun = [
      () => {
        const FS = globalThis.FS
        for (const f of cfg.fonts ?? []) {
          FS.mkdirTree(f.path.slice(0, f.path.lastIndexOf('/')))
          FS.writeFile(f.path, f.bytes)
        }
        cfg.fonts = null
      },
    ]
    M.onAbort = (what) => reject(new Error('LibreOffice engine stopped: ' + what))
    zHM.start(() => resolve({ thrPort: zHM.thrPort, FS: zHM.FS }))
  })

window.loFrameReady = true
