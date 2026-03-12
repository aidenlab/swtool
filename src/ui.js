/**
 * All DOM state transitions live here.  main.js calls these functions;
 * no other module should touch the DOM directly.
 */

const statusArea     = () => document.getElementById('status-area')
const modeIndicator  = () => document.getElementById('mode-indicator')
const inputPanel     = () => document.getElementById('input-panel')

const MODE_LABELS = {
  single_point: 'Ball & Stick',
  multi_point:  'Point Cloud',
}

// ── State transitions ─────────────────────────────────────────────────────────

export function showIdle() {
  statusArea().innerHTML = ''
}

export function showConverting() {
  statusArea().innerHTML = `
    <div class="alert alert-info d-flex align-items-center gap-2 mb-0">
      <span class="spinner-border text-info" role="status" aria-hidden="true"></span>
      <span>Converting…</span>
    </div>`
}

export function showSuccess(outputFilename, bytes) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)

  statusArea().innerHTML = `
    <div class="alert alert-success d-flex align-items-center justify-content-between gap-2 mb-0">
      <span>✅ Conversion complete.</span>
      <a href="${url}" download="${escapeHtml(outputFilename)}"
         class="btn btn-sm btn-success text-nowrap">
        Download ${escapeHtml(outputFilename)}
      </a>
    </div>`
}

export function showError(message) {
  statusArea().innerHTML = `
    <div class="alert alert-danger d-flex align-items-center gap-2 mb-0">
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

  // Reveal the input panel
  inputPanel().classList.remove('d-none')
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

// ── Utils ─────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
