import { validateFileExtension, validateHeader } from './parser/validation.js'
import { parseSwtText }  from './parser/swtParser.js'
import { convertToSw }   from './hdf5Writer.js'
import {
  showIdle,
  showFileReady,
  showConverting,
  showSuccess,
  showError,
  syncLcmVisibility,
} from './ui.js'

// ── State ─────────────────────────────────────────────────────────────────────

let pendingText     = null   // raw .swt file contents
let pendingFilename = null   // original filename (for deriving output name)

// ── Boot ──────────────────────────────────────────────────────────────────────

showIdle()

// Keep the live-contact-map checkbox in sync with the mode radios
document.querySelectorAll('input[name="point-mode"]').forEach(radio => {
  radio.addEventListener('change', syncLcmVisibility)
})
syncLcmVisibility()

// ── Drop zone ─────────────────────────────────────────────────────────────────

const dropZone  = document.getElementById('drop-zone')
const fileInput = document.getElementById('file-input')

dropZone.addEventListener('click', () => fileInput.click())
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click()
})

dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer?.files?.[0]
  if (file) loadFile(file)
})

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
    acceptText(text, filename)
  } catch (err) {
    showError(`Could not fetch URL: ${err.message}`)
  }
})

// ── Convert button ────────────────────────────────────────────────────────────

document.getElementById('convert-btn').addEventListener('click', async () => {
  if (!pendingText) return

  const mode = document.querySelector('input[name="point-mode"]:checked').value
  const liveContactMap = document.getElementById('live-contact-map').checked
  const includeIndex = document.getElementById('include-index').checked

  showConverting()

  // Yield to the browser so the spinner has a chance to paint
  await new Promise(r => setTimeout(r, 0))

  try {
    const parsed = parseSwtText(pendingText)
    const bytes  = await convertToSw(parsed, mode, liveContactMap, includeIndex)
    const outputName = deriveOutputName(pendingFilename)
    showSuccess(outputName, bytes)
  } catch (err) {
    showError(err.message)
    console.error(err)
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadFile(file) {
  const extCheck = validateFileExtension(file.name)
  if (!extCheck.valid) {
    showError(extCheck.error)
    return
  }

  const reader = new FileReader()
  reader.onload = e => acceptText(e.target.result, file.name)
  reader.onerror = () => showError('Could not read the file.')
  reader.readAsText(file)
}

function acceptText(text, filename) {
  const headerLine = text.split(/\r?\n/)[0] ?? ''
  const headerCheck = validateHeader(headerLine)
  if (!headerCheck.valid) {
    showError(headerCheck.error)
    return
  }

  pendingText     = text
  pendingFilename = filename
  showFileReady(filename)
}

function deriveOutputName(filename) {
  return filename.replace(/\.swt$/i, '') + '.sw'
}
