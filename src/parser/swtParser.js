/**
 * Parses a .swt File object into a structured object using streaming,
 * avoiding loading the entire file into memory at once.
 *
 * @param {File} file - The .swt File from a file input or drop.
 * @returns {Promise<{ metadata: Object, regions: string[][], traces: Map<number, Array> }>}
 *
 * regions: deduplicated, start-sorted array of [chr, start, end] (all strings)
 * traces:  Map<traceIndex, Array<{chr, start, end, x, y, z}>>
 */
export async function parseSwtFile(fileOrStream) {
  const regionMap = new Map()   // key → [chr, start, end]
  const traces = new Map()      // traceIndex → [{chr, start, end, x, y, z}]
  let currentTrace = null
  let metadata = null
  let lineNumber = 0

  const byteStream = (fileOrStream instanceof ReadableStream)
    ? fileOrStream
    : fileOrStream.stream()
  const stream = byteStream.pipeThrough(new TextDecoderStream())
  let remainder = ''

  for await (const chunk of stream) {
    const text = remainder + chunk
    const lines = text.split(/\r?\n/)

    // Last element may be incomplete — save for next chunk
    remainder = lines.pop()

    for (const line of lines) {
      processLine(line, lineNumber, regionMap, traces, (m) => { metadata = m }, () => currentTrace, (t) => { currentTrace = t })
      lineNumber++
    }
  }

  // Process any remaining text after the stream ends
  if (remainder.trim()) {
    processLine(remainder, lineNumber, regionMap, traces, (m) => { metadata = m }, () => currentTrace, (t) => { currentTrace = t })
  }

  const regions = sortRegionsByStart([...regionMap.values()])
  return { metadata: metadata ?? {}, regions, traces }
}

/**
 * Parses a .swt text string into a structured object.
 * Kept for compatibility (URL fetch, tests, etc.).
 *
 * @param {string} text - Full contents of the .swt file.
 * @returns {{ metadata: Object, regions: string[][], traces: Map<number, Array> }}
 */
export function parseSwtText(text) {
  const lines = text.split(/\r?\n/)

  const metadata = parseMetadataLine(lines[0])

  const regionMap = new Map()
  const traces = new Map()
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

// ── Line processor (shared logic) ────────────────────────────────────────────

function processLine(line, lineNumber, regionMap, traces, setMetadata, getTrace, setTrace) {
  if (lineNumber === 0) {
    setMetadata(parseMetadataLine(line))
    return
  }
  if (lineNumber === 1) return  // column header — discard

  if (!line.trim()) return

  if (isTraceLine(line)) {
    const t = parseTraceLine(line)
    setTrace(t)
    if (!traces.has(t)) {
      traces.set(t, [])
    }
  } else if (isDataLine(line)) {
    const point = parseDataLine(line)
    const key = buildRegionKey(point.chr, point.start, point.end)
    if (!regionMap.has(key)) {
      regionMap.set(key, [point.chr, point.start, point.end])
    }
    const currentTrace = getTrace()
    if (currentTrace !== null) {
      traces.get(currentTrace).push(point)
    }
  }
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
