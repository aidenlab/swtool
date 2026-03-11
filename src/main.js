import { validateFileExtension, validateHeader } from './parser/validation.js'
import { parseSwtText }  from './parser/swtParser.js'
import { convertToSw }   from './hdf5Writer.js'
import {
  showIdle,
  showConverting,
  showSuccess,
  showError,
  setPointModeSectionVisible,
  showDropZoneSpinner,
  hideDropZoneSpinners,
} from './ui.js'

// ── State ─────────────────────────────────────────────────────────────────────

let pendingFile     = null   // File object for streaming parse
let pendingText     = null   // raw .swt text (URL fetch only)
let pendingFilename = null   // original filename (for deriving output name)
let activeDropZone  = null   // which drop zone initiated the current conversion

// ── Boot ──────────────────────────────────────────────────────────────────────

showIdle()

// ── Drop zones (ballstick = single-point, pointcloud = multi-point) ─────────────

function setupDropZone(zoneId, fileInputId, mode) {
  const zone = document.getElementById(zoneId)
  const fileInput = document.getElementById(fileInputId)

  zone.addEventListener('click', () => fileInput.click())
  zone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click()
  })

  zone.addEventListener('dragover', e => {
    e.preventDefault()
    zone.classList.add('drag-over')
  })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    const file = e.dataTransfer?.files?.[0]
    if (file) loadFile(file, mode, zoneId)
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) loadFile(file, mode, zoneId)
    fileInput.value = ''
  })
}

setupDropZone('drop-zone-ballstick', 'file-input-ballstick', 'single_point')
setupDropZone('drop-zone-pointcloud', 'file-input-pointcloud', 'multi_point')

// ── File picker (no auto mode — user selects point mode manually) ─────────────

const fileInput = document.getElementById('file-input')
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) loadFile(file)
})

// ── URL fetch ─────────────────────────────────────────────────────────────────

document.getElementById('url-fetch-btn').addEventListener('click', async () => {
  const url = document.getElementById('url-input').value.trim()
  if (!url) return

  showConverting()
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${resp.statusText}`)
    const text = await resp.text()
    const filename = url.split('/').pop().split('?')[0] || 'file.swt'
    setPointModeSectionVisible(true)
    await acceptText(text, filename)
  } catch (err) {
    showError(`Could not fetch URL: ${err.message}`)
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadFile(file, mode, zoneId) {
  const extCheck = validateFileExtension(file.name)
  if (!extCheck.valid) {
    showError(extCheck.error)
    return
  }

  if (mode) {
    document.getElementById(mode === 'single_point' ? 'mode-single' : 'mode-multi').checked = true
    setPointModeSectionVisible(false)
  } else {
    setPointModeSectionVisible(true)
  }

  // Read only the first 1 KB to validate the header — avoids loading the entire file
  const headerSlice = file.slice(0, 1024)
  const headerText = await headerSlice.text()
  const headerLine = headerText.split(/\r?\n/)[0] ?? ''
  const headerCheck = validateHeader(headerLine)
  if (!headerCheck.valid) {
    showError(headerCheck.error)
    return
  }

  pendingFile     = file
  pendingText     = null
  pendingFilename = file.name
  activeDropZone  = zoneId ?? null
  await runConversion()
}

async function acceptText(text, filename) {
  const headerLine = text.split(/\r?\n/)[0] ?? ''
  const headerCheck = validateHeader(headerLine)
  if (!headerCheck.valid) {
    showError(headerCheck.error)
    return
  }

  pendingText     = text
  pendingFile     = null
  pendingFilename = filename
  activeDropZone  = null
  await runConversion()
}

async function runConversion() {
  if (!pendingFile && !pendingText) return

  const mode = document.querySelector('input[name="point-mode"]:checked').value
  const includeIndex = document.getElementById('include-index').checked

  showConverting()
  if (activeDropZone) showDropZoneSpinner(activeDropZone)

  await new Promise(r => setTimeout(r, 0))

  try {
    let bytes
    if (pendingFile) {
      bytes = await convertFileInWorker(pendingFile, mode, includeIndex)
    } else {
      const parsed = parseSwtText(pendingText)
      bytes = await convertToSw(parsed, mode, false, includeIndex)
    }
    const outputName = deriveOutputName(pendingFilename)
    hideDropZoneSpinners()
    showSuccess(outputName, bytes)
  } catch (err) {
    hideDropZoneSpinners()
    showError(err.message)
    console.error(err)
  }
}

function deriveOutputName(filename) {
  return filename.replace(/\.swt$/i, '') + '.sw'
}

function convertFileInWorker(file, mode, includeIndex) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./parser/swtParser.worker.js', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = ({ data }) => {
      worker.terminate()
      if (data.ok) resolve(data.bytes)
      else reject(new Error(data.error))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message ?? 'Worker failed'))
    }
    worker.postMessage({ file, mode, includeIndex })
  })
}
