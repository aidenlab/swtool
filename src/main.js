import { validateFileExtension, validateHeader } from './parser/validation.js'
import { parseSwtText }  from './parser/swtParser.js'
import { convertToSw }   from './hdf5Writer.js'
import {
  showIdle,
  showConverting,
  showSuccess,
  showError,
  updateModeUI,
  hideInputPanel,
  showDropZoneSpinner,
  hideDropZoneSpinners,
} from './ui.js'

// ── State ─────────────────────────────────────────────────────────────────────

let selectedMode    = null   // 'single_point' | 'multi_point'
let pendingFile     = null   // File object for streaming parse
let pendingText     = null   // raw .swt text (URL fetch only)
let pendingFilename = null   // original filename (for deriving output name)
let activeDropZone  = null   // which drop zone initiated the current conversion

// ── Boot ──────────────────────────────────────────────────────────────────────

showIdle()

// ── Mode selection ───────────────────────────────────────────────────────────

function selectMode(mode) {
  selectedMode = mode
  updateModeUI(mode)
}

// ── Drop zones (ballstick = single-point, pointcloud = multi-point) ─────────

function setupDropZone(zoneId, mode) {
  const zone = document.getElementById(zoneId)

  zone.addEventListener('click', () => selectMode(mode))
  zone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') selectMode(mode)
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
    if (file) {
      selectMode(mode)
      loadFile(file, mode, zoneId)
    }
  })
}

setupDropZone('drop-zone-ballstick', 'single_point')
setupDropZone('drop-zone-pointcloud', 'multi_point')

// ── Click outside to dismiss ─────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  if (!selectedMode) return
  const panel = document.getElementById('input-panel')
  const cards = document.querySelector('.drop-zones-row')
  if (!panel.contains(e.target) && !cards.contains(e.target)) {
    selectedMode = null
    hideInputPanel()
  }
})

// ── File picker ──────────────────────────────────────────────────────────────

const fileInput = document.getElementById('file-input')
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file && selectedMode) loadFile(file, selectedMode)
  fileInput.value = ''
})

// ── URL fetch ────────────────────────────────────────────────────────────────

document.getElementById('url-fetch-btn').addEventListener('click', async () => {
  const url = document.getElementById('url-input').value.trim()
  if (!url || !selectedMode) return

  showConverting()
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${resp.statusText}`)
    const text = await resp.text()
    const filename = url.split('/').pop().split('?')[0] || 'file.swt'
    await acceptText(text, filename, selectedMode)
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
  await runConversion(mode)
}

async function acceptText(text, filename, mode) {
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
  await runConversion(mode)
}

async function runConversion(mode) {
  if (!pendingFile && !pendingText) return

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
