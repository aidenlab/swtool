/**
 * Parses a .swt text string into a structured object.
 *
 * @param {string} text - Full contents of the .swt file.
 * @returns {{ metadata: Object, regions: string[][], traces: Map<number, Array> }}
 *
 * regions: deduplicated, start-sorted array of [chr, start, end] (all strings)
 * traces:  Map<traceIndex, Array<{chr, start, end, x, y, z}>>
 */
export function parseSwtText(text) {
  const lines = text.split(/\r?\n/)

  // Line 0: ## metadata
  const metadata = parseMetadataLine(lines[0])

  // Line 1: column header — discard
  // Lines 2+: trace delimiters and data lines

  const regionMap = new Map()   // key → [chr, start, end]
  const traces = new Map()      // traceIndex → [{chr, start, end, x, y, z}]
  let currentTrace = null

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    if (isTraceLine(line)) {
      currentTrace = parseTraceLine(line)
      if (!traces.has(currentTrace)) {
        traces.set(currentTrace, [])
      }
    } else if (isDataLine(line)) {
      const point = parseDataLine(line)
      const key = buildRegionKey(point.chr, point.start, point.end)
      if (!regionMap.has(key)) {
        regionMap.set(key, [point.chr, point.start, point.end])
      }
      if (currentTrace !== null) {
        traces.get(currentTrace).push(point)
      }
    }
  }

  const regions = sortRegionsByStart([...regionMap.values()])
  return { metadata, regions, traces }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMetadataLine(line) {
  // "##format=sw1 name=IMR90 genome=hg38" → { format: 'sw1', name: 'IMR90', genome: 'hg38' }
  const stripped = line.startsWith('##') ? line.slice(2) : line
  const metadata = {}
  for (const token of stripped.trim().split(/\s+/)) {
    const eq = token.indexOf('=')
    if (eq !== -1) {
      metadata[token.slice(0, eq)] = token.slice(eq + 1)
    }
  }
  return metadata
}

function isTraceLine(line) {
  return /^trace\s+\d+/.test(line.trimStart())
}

function parseTraceLine(line) {
  // "trace 0" → 0
  const tokens = line.trim().split(/\s+/)
  return parseInt(tokens[1], 10)
}

function isDataLine(line) {
  return line.trim().split(/\s+/).length === 6
}

function parseDataLine(line) {
  const tokens = line.trim().split(/\s+/)
  return {
    chr:   tokens[0],
    start: tokens[1],
    end:   tokens[2],
    x: toFloat(tokens[3]),
    y: toFloat(tokens[4]),
    z: toFloat(tokens[5]),
  }
}

function buildRegionKey(chr, start, end) {
  return `${chr}%${start}%${end}`
}

function sortRegionsByStart(regions) {
  // Sort by integer value of start position (mirrors Python's int-sort by key[1])
  return regions.slice().sort((a, b) => parseInt(a[1], 10) - parseInt(b[1], 10))
}

function toFloat(value) {
  const n = parseFloat(value)
  return isNaN(n) ? 0.0 : n
}
