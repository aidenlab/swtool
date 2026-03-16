import { validateFileExtension, validateHeader } from './parser/validation.js'
import {
  showIdle,
  showConverting,
  showSuccess,
  showError,
  updateModeUI,
  hideInputPanel,
  showDropZoneSpinner,
  hideDropZoneSpinners,
  showStagedFile,
  hideStagedFile,
  resetInputPanel,
} from './ui.js'

// ── State ─────────────────────────────────────────────────────────────────────

let selectedMode    = null   // 'single_point' | 'multi_point'
let pendingFile     = null   // File object for streaming parse
let pendingUrl      = null   // normalized URL for streaming fetch in worker
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
      stageFile(file, zoneId)
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
    clearStaged()
    hideInputPanel()
  }
})

// ── File picker ──────────────────────────────────────────────────────────────

const fileInput = document.getElementById('file-input')
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file && selectedMode) stageFile(file)
  fileInput.value = ''
})

// ── URL fetch ────────────────────────────────────────────────────────────────

document.getElementById('url-fetch-btn').addEventListener('click', () => {
  const rawUrl = document.getElementById('url-input').value.trim()
  if (!rawUrl || !selectedMode) return

  const url = normalizeUrl(rawUrl)
  console.log(`[url-fetch] staged: ${url}`)

  const filename = url.split('/').pop().split('?')[0] || 'file.swt'
  stageUrl(url, filename)
})

// ── Convert / Cancel buttons ─────────────────────────────────────────────────

document.getElementById('convert-btn').addEventListener('click', () => {
  if (selectedMode && (pendingFile || pendingUrl)) {
    runConversion(selectedMode)
  }
})

document.getElementById('cancel-btn').addEventListener('click', () => {
  clearStaged()
  resetInputPanel()
})

// ── Staging helpers ──────────────────────────────────────────────────────────

async function stageFile(file, zoneId) {
  const extCheck = validateFileExtension(file.name)
  if (!extCheck.valid) {
    showError(extCheck.error)
    return
  }

  const headerSlice = file.slice(0, 1024)
  const headerText = await headerSlice.text()
  const headerLine = headerText.split(/\r?\n/)[0] ?? ''
  const headerCheck = validateHeader(headerLine)
  if (!headerCheck.valid) {
    showError(headerCheck.error)
    return
  }

  pendingFile     = file
  pendingUrl      = null
  pendingFilename = file.name
  activeDropZone  = zoneId ?? null
  showStagedFile(file.name)
}

function stageUrl(url, filename) {
  pendingUrl      = url
  pendingFile     = null
  pendingFilename = filename
  activeDropZone  = null
  showStagedFile(filename)
}

function clearStaged() {
  pendingFile     = null
  pendingUrl      = null
  pendingFilename = null
  activeDropZone  = null
  selectedMode    = null
  hideStagedFile()
}

// ── Conversion ───────────────────────────────────────────────────────────────

async function runConversion(mode) {
  if (!pendingFile && !pendingUrl) return

  const includeIndex = true

  showConverting()
  if (activeDropZone) showDropZoneSpinner(activeDropZone)

  await new Promise(r => setTimeout(r, 0))

  try {
    const bytes = await convertInWorker({ file: pendingFile, url: pendingUrl, mode, includeIndex })
    const outputName = deriveOutputName(pendingFilename)
    hideDropZoneSpinners()
    showSuccess(outputName, bytes)
  } catch (err) {
    hideDropZoneSpinners()
    showError(err.message)
    console.error(err)
  }
}

/** Rewrite known hosting URLs so they serve raw files with CORS headers. */
function normalizeUrl(url) {
  // Dropbox: swap domain to dl.dropboxusercontent.com for direct CORS access
  if (/www\.dropbox\.com\//.test(url)) {
    const normalized = url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/[?&]dl=[01]/, '')
    console.log(`[normalizeUrl] Dropbox detected, rewrote domain`)
    return normalized
  }
  console.log(`[normalizeUrl] no rewrite needed`)
  return url
}

function deriveOutputName(filename) {
  return filename.replace(/\.swt$/i, '') + '.sw'
}

function convertInWorker(msg) {
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
    worker.postMessage(msg)
  })
}
