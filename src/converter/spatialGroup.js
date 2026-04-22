/**
 * Writes spatial_position/t_N datasets for each trace.
 *
 * Single-point mode: each t_N has shape (n_data_lines, 3) — columns x, y, z.
 * Multi-point mode:  each t_N has shape (n_points, 4)    — columns region_index, x, y, z.
 *
 * @param {import('h5wasm').Group} nameGroup
 * @param {Map<number, Array>} traces
 * @param {Map<string, number>} regionIndex
 * @param {'single_point'|'multi_point'} mode
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
