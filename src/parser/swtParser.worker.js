import { parseSwtFile } from './swtParser.js'
import { convertToSw }  from '../hdf5Writer.js'

self.onmessage = async ({ data: { file, url, mode, includeIndex } }) => {
  try {
    let source
    if (url) {
      console.log(`[worker] fetching ${url}`)
      const t0 = performance.now()
      const resp = await fetch(url)
      console.log(`[worker] response: ${resp.status} (${(performance.now() - t0).toFixed(0)} ms)`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${resp.statusText}`)
      source = resp.body  // ReadableStream — streamed, never fully buffered
    } else {
      source = file
    }
    const parsed = await parseSwtFile(source)
    const bytes  = await convertToSw(parsed, mode, includeIndex)
    self.postMessage({ ok: true, bytes }, [bytes.buffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err.message })
  }
}
