/**
 * Writes spatial_position/t_N datasets for each trace.
 *
 * Single-point mode: each t_N has shape (n_data_lines, 3) — columns x, y, z.
 * Multi-point mode:  each t_N has shape (n_points, 4)    — columns region_index, x, y, z.
 *
 * Also returns a baked live_contact_map_vertices array of shape
 * (trace_count, trace_length, 3) float32, NaN for missing — the v1 format
 * hic-straw's loadLiveVertices consumes as a fast path. For multi-point,
 * each (trace, region) cell is the arithmetic mean of its point cloud.
 *
 * @param {import('h5wasm').Group} nameGroup
 * @param {Map<number, Array>} traces
 * @param {Map<string, number>} regionIndex
 * @param {'single_point'|'multi_point'} mode
 * @returns {{ data: Float32Array, shape: number[] } | null}
 */
export function writeSpatialGroup(nameGroup, traces, regionIndex, mode) {
  const spGroup = nameGroup.create_group('spatial_position')

  for (const [traceIdx, points] of traces) {
    const datasetName = `t_${traceIdx}`

    if (mode === 'single_point') {
      writeSinglePointDataset(spGroup, datasetName, points)
    } else {
      writeMultiPointDataset(spGroup, datasetName, points, regionIndex)
    }
  }

  if (traces.size === 0) return null
  return mode === 'single_point'
    ? buildLiveContactMapVerticesBakeSinglePoint(traces, regionIndex)
    : buildLiveContactMapVerticesBakeMultiPoint(traces, regionIndex)
}

// ── Single-point ──────────────────────────────────────────────────────────────

function writeSinglePointDataset(group, name, points) {
  const n = points.length
  const data = new Float64Array(n * 3)

  for (let i = 0; i < n; i++) {
    const { x, y, z } = points[i]
    data[i * 3]     = x
    data[i * 3 + 1] = y
    data[i * 3 + 2] = z
  }

  group.create_dataset({ name, data, shape: [n, 3], dtype: '<d' })
}

// ── Multi-point ───────────────────────────────────────────────────────────────

function writeMultiPointDataset(group, name, points, regionIndex) {
  // Group points by region key so we can produce one row per point
  // with region_index prepended: [region_index, x, y, z]
  const regionBuckets = new Map()

  for (const point of points) {
    const key = `${point.chr}%${point.start}%${point.end}`
    if (!regionBuckets.has(key)) {
      regionBuckets.set(key, [])
    }
    regionBuckets.get(key).push(point)
  }

  // Accumulate rows in insertion order (mirrors Python dict iteration)
  const rows = []
  for (const [key, bucket] of regionBuckets) {
    const rIdx = regionIndex.get(key) ?? 0
    for (const { x, y, z } of bucket) {
      rows.push(rIdx, x, y, z)
    }
  }

  const n = rows.length / 4
  const data = new Float64Array(rows)
  group.create_dataset({ name, data, shape: [n, 4], dtype: '<d' })
}

// ── Live contact map vertices bake (v1) ──────────────────────────────────────

function buildLiveContactMapVerticesBakeSinglePoint(traces, regionIndex) {
  const traceLength = regionIndex.size
  const sortedTraceIndices = [...traces.keys()].sort((a, b) => a - b)
  const traceCount = sortedTraceIndices.length

  const data = new Float32Array(traceCount * traceLength * 3)
  data.fill(NaN)

  for (let ti = 0; ti < traceCount; ti++) {
    const points = traces.get(sortedTraceIndices[ti])
    const traceBase = ti * traceLength * 3
    for (const { chr, start, end, x, y, z } of points) {
      const ri = regionIndex.get(`${chr}%${start}%${end}`)
      if (ri == null) continue
      const off = traceBase + ri * 3
      data[off]     = x
      data[off + 1] = y
      data[off + 2] = z
    }
  }

  return { data, shape: [traceCount, traceLength, 3] }
}

// Per (trace, region): arithmetic mean of xyz over the region's point cloud,
// skipping any NaN coordinates. Cells with no finite points stay NaN.
function buildLiveContactMapVerticesBakeMultiPoint(traces, regionIndex) {
  const traceLength = regionIndex.size
  const sortedTraceIndices = [...traces.keys()].sort((a, b) => a - b)
  const traceCount = sortedTraceIndices.length

  const data = new Float32Array(traceCount * traceLength * 3)
  data.fill(NaN)

  const sumX = new Float64Array(traceLength)
  const sumY = new Float64Array(traceLength)
  const sumZ = new Float64Array(traceLength)
  const counts = new Uint32Array(traceLength)

  for (let ti = 0; ti < traceCount; ti++) {
    sumX.fill(0); sumY.fill(0); sumZ.fill(0); counts.fill(0)

    const points = traces.get(sortedTraceIndices[ti])
    for (const { chr, start, end, x, y, z } of points) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
      const ri = regionIndex.get(`${chr}%${start}%${end}`)
      if (ri == null) continue
      sumX[ri] += x
      sumY[ri] += y
      sumZ[ri] += z
      counts[ri]++
    }

    const traceBase = ti * traceLength * 3
    for (let ri = 0; ri < traceLength; ri++) {
      const n = counts[ri]
      if (n === 0) continue
      const off = traceBase + ri * 3
      data[off]     = sumX[ri] / n
      data[off + 1] = sumY[ri] / n
      data[off + 2] = sumZ[ri] / n
    }
  }

  return { data, shape: [traceCount, traceLength, 3] }
}
