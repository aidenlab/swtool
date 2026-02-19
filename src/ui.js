/**
 * All DOM state transitions live here.  main.js calls these functions;
 * no other module should touch the DOM directly.
 */

const statusArea       = () => document.getElementById('status-area')
const convertBtn       = () => document.getElementById('convert-btn')
const lcmOption        = () => document.getElementById('lcm-option')
const modeMulti        = () => document.getElementById('mode-multi')
const pointModeSection = () => document.getElementById('point-mode-section')

// ── State transitions ─────────────────────────────────────────────────────────

export function showIdle() {
  statusArea().innerHTML = ''
  convertBtn().disabled = true
  setPointModeSectionVisible(false)
}

export function showFileReady(filename) {
  statusArea().innerHTML = `
    <div class="alert alert-secondary d-flex align-items-center gap-2 mb-0">
      <span>📄</span>
      <span class="text-truncate"><strong>${escapeHtml(filename)}</strong> loaded.</span>
    </div>`
  convertBtn().disabled = false
}

export function showConverting() {
  statusArea().innerHTML = `
    <div class="alert alert-info d-flex align-items-center gap-2 mb-0">
      <span class="spinner-border text-info" role="status" aria-hidden="true"></span>
      <span>Converting…</span>
    </div>`
  convertBtn().disabled = true
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
  convertBtn().disabled = false
}

export function showError(message) {
  statusArea().innerHTML = `
    <div class="alert alert-danger d-flex align-items-center gap-2 mb-0">
      <span>❌</span>
      <span>${escapeHtml(message)}</span>
    </div>`
  convertBtn().disabled = false
}

// ── Option helpers ────────────────────────────────────────────────────────────

/** Show or hide the point mode radios (only needed for file picker / URL). */
export function setPointModeSectionVisible(visible) {
  const el = pointModeSection()
  if (visible) el.classList.remove('d-none')
  else el.classList.add('d-none')
}

/** Disable the live-contact-map checkbox when multi-point is selected. */
export function syncLcmVisibility() {
  const isMulti = modeMulti().checked
  const lcm = lcmOption()
  lcm.style.opacity = isMulti ? '0.4' : '1'
  const checkbox = document.getElementById('live-contact-map')
  checkbox.disabled = isMulti
  if (isMulti) checkbox.checked = false
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
