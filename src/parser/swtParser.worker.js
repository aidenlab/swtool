import { parseSwtFile } from './swtParser.js'
import { convertToSw }  from '../hdf5Writer.js'

self.onmessage = async ({ data: { file, mode, includeIndex } }) => {
  try {
    const parsed = await parseSwtFile(file)
    const bytes  = await convertToSw(parsed, mode, false, includeIndex)
    self.postMessage({ ok: true, bytes }, [bytes.buffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err.message })
  }
}
