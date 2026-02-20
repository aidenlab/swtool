import { validateFileExtension, validateHeader } from './parser/validation.js'
import { parseSwtText }  from './parser/swtParser.js'
import { convertToSw }   from './hdf5Writer.js'
import {
  showIdle,
  showConverting,
  showSuccess,
  showError,
  setPointModeSectionVisible,
} from './ui.js'

// ── State ─────────────────────────────────────────────────────────────────────

let pendingText     = null   // raw .swt file contents
let pendingFilename = null   // original filename (for deriving output name)

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
    if (file) loadFile(file, mode)
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) loadFile(file, mode)
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

function loadFile(file, mode) {
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

  const reader = new FileReader()
  reader.onload = async e => {
    await acceptText(e.target.result, file.name)
  }
  reader.onerror = () => showError('Could not read the file.')
  reader.readAsText(file)
}

async function acceptText(text, filename) {
  const headerLine = text.split(/\r?\n/)[0] ?? ''
  const headerCheck = validateHeader(headerLine)
  if (!headerCheck.valid) {
    showError(headerCheck.error)
    return
  }

  pendingText     = text
  pendingFilename = filename
  await runConversion()
}

async function runConversion() {
  if (!pendingText) return

  const mode = document.querySelector('input[name="point-mode"]:checked').value
  const includeIndex = document.getElementById('include-index').checked

  showConverting()

  await new Promise(r => setTimeout(r, 0))

  try {
    const parsed = parseSwtText(pendingText)
    const bytes  = await convertToSw(parsed, mode, false, includeIndex)
    const outputName = deriveOutputName(pendingFilename)
    showSuccess(outputName, bytes)
  } catch (err) {
    showError(err.message)
    console.error(err)
  }
}

function deriveOutputName(filename) {
  return filename.replace(/\.swt$/i, '') + '.sw'
}
