/**
 * All DOM state transitions live here.  main.js calls these functions;
 * no other module should touch the DOM directly.
 */

const statusArea     = () => document.getElementById('status-area')
const modeIndicator  = () => document.getElementById('mode-indicator')
const inputPanel     = () => document.getElementById('input-panel')
const stagedFile     = () => document.getElementById('staged-file')
const stagedFileName = () => document.getElementById('staged-file-name')
const actionButtons  = () => document.getElementById('action-buttons')

const MODE_LABELS = {
  single_point: 'Ball & Stick',
  multi_point:  'Point Cloud',
}

// ── State transitions ─────────────────────────────────────────────────────────

export function showIdle() {
  statusArea().innerHTML = ''
}

export function showConverting() {
  document.getElementById('convert-btn').classList.add('d-none')
  statusArea().innerHTML = `
    <div class="alert alert-info d-flex align-items-center gap-2">
      <span class="spinner-border text-info" role="status" aria-hidden="true"></span>
      <span>Converting…</span>
    </div>`
}

export function showSuccess(outputFilename, bytes) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)

  statusArea().innerHTML = `
    <div class="alert alert-success d-flex align-items-center justify-content-between gap-2">
      <span>✅ Conversion complete.</span>
      <div class="d-flex gap-2">
        <a id="download-link" href="${url}" download="${escapeHtml(outputFilename)}"
           class="btn btn-sm btn-success text-nowrap">
          Download ${escapeHtml(outputFilename)}
        </a>
        <button id="open-spacewalk-btn" type="button"
                class="btn btn-sm btn-primary text-nowrap">
          Open in Spacewalk
        </button>
      </div>
    </div>`

  document.getElementById('open-spacewalk-btn').addEventListener('click', () => {
    openInSpacewalk(bytes, outputFilename)
  })

  // Let the user linger — rename Cancel to Dismiss
  document.getElementById('cancel-btn').textContent = 'Dismiss'
}

export function showError(message) {
  statusArea().innerHTML = `
    <div class="alert alert-danger d-flex align-items-center gap-2">
      <span>❌</span>
      <span>${escapeHtml(message)}</span>
    </div>`
}

// ── Mode UI ──────────────────────────────────────────────────────────────────

export function updateModeUI(mode) {
  // Toggle selected class on mode cards
  for (const card of document.querySelectorAll('.mode-card')) {
    card.classList.toggle('mode-card--selected', card.dataset.mode === mode)
  }

  // Update indicator text
  const label = MODE_LABELS[mode] ?? mode
  modeIndicator().textContent = `Converting as: ${label}`

  // Reveal the input panel with Cancel visible immediately
  inputPanel().classList.remove('d-none')
  showCancelOnly()
}

export function hideInputPanel() {
  inputPanel().classList.add('d-none')

  // Deselect all mode cards
  for (const card of document.querySelectorAll('.mode-card')) {
    card.classList.remove('mode-card--selected')
  }
}

/** Show the spinner overlay on a specific drop zone. */
export function showDropZoneSpinner(zoneId) {
  const spinner = document.querySelector(`#${zoneId} .drop-zone-spinner`)
  if (spinner) spinner.classList.remove('d-none')
}

/** Hide all drop zone spinner overlays. */
export function hideDropZoneSpinners() {
  for (const el of document.querySelectorAll('.drop-zone-spinner')) {
    el.classList.add('d-none')
  }
}

// ── Staging UI ───────────────────────────────────────────────────────────────

export function showStagedFile(filename) {
  stagedFileName().textContent = filename
  stagedFile().classList.remove('d-none')
  // Show both Convert and Cancel
  actionButtons().classList.remove('d-none')
  document.getElementById('convert-btn').classList.remove('d-none')
}

/** Show action buttons with only Cancel visible (no file staged yet). */
function showCancelOnly() {
  actionButtons().classList.remove('d-none')
  document.getElementById('convert-btn').classList.add('d-none')
}

export function hideStagedFile() {
  stagedFile().classList.add('d-none')
  actionButtons().classList.add('d-none')
  document.getElementById('convert-btn').classList.remove('d-none')
  stagedFileName().textContent = ''
}

export function resetInputPanel() {
  hideStagedFile()
  hideInputPanel()
  statusArea().innerHTML = ''
  document.getElementById('cancel-btn').textContent = 'Cancel'
}

// ── Spacewalk integration ─────────────────────────────────────────────────────

const DEFAULT_SPACEWALK_URL = 'https://aidenlab.org/spacewalk/'

function openInSpacewalk(bytes, filename) {
  let spacewalkURL = import.meta.env.VITE_SPACEWALK_URL
  if (!spacewalkURL) {
    console.warn(`VITE_SPACEWALK_URL is not set; falling back to ${DEFAULT_SPACEWALK_URL}`)
    spacewalkURL = DEFAULT_SPACEWALK_URL
  }
  const spacewalkWindow = window.open(spacewalkURL)

  window.addEventListener('message', function handler(event) {
    if (event.data?.type !== 'spacewalk-ready') return
    window.removeEventListener('message', handler)
    spacewalkWindow.postMessage(
      { type: 'spacewalk-load', bytes, filename },
      '*'
    )
  })
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
