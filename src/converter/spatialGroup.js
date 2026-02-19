/**
 * Writes spatial_position/t_N datasets for each trace.
 *
 * Single-point mode: each t_N has shape (n_data_lines, 3) — columns x, y, z.
 * Multi-point mode:  each t_N has shape (n_points, 4)    — columns region_index, x, y, z.
 *
 * Returns the live contact map vertices array (x, y, z interleaved as Float64)
 * for single-point mode when liveContactMap is true; otherwise returns null.
 *
 * @param {import('h5wasm').Group} nameGroup
 * @param {Map<number, Array>} traces
 * @param {Map<string, number>} regionIndex
 * @param {'single_point'|'multi_point'} mode
 * @param {boolean} liveContactMap
 */
export function writeSpatialGroup(nameGroup, traces, regionIndex, mode, liveContactMap) {
  const spGroup = nameGroup.create_group('spatial_position')

  const lcmvX = []
  const lcmvY = []
  const lcmvZ = []

  for (const [traceIdx, points] of traces) {
    const datasetName = `t_${traceIdx}`

    if (mode === 'single_point') {
      writeSinglePointDataset(spGroup, datasetName, points, liveContactMap, lcmvX, lcmvY, lcmvZ)
    } else {
      writeMultiPointDataset(spGroup, datasetName, points, regionIndex)
    }
  }

  if (liveContactMap && lcmvX.length > 0) {
    return buildLcmvArray(lcmvX, lcmvY, lcmvZ)
  }
  return null
}

// ── Single-point ──────────────────────────────────────────────────────────────

function writeSinglePointDataset(group, name, points, liveContactMap, lcmvX, lcmvY, lcmvZ) {
  const n = points.length
  const data = new Float64Array(n * 3)

  for (let i = 0; i < n; i++) {
    const { x, y, z } = points[i]
    data[i * 3]     = x
    data[i * 3 + 1] = y
    data[i * 3 + 2] = z

    if (liveContactMap) {
      lcmvX.push(x)
      lcmvY.push(y)
      lcmvZ.push(z)
    }
  }

  group.create_dataset({ name, data, shape: [n, 3], dtype: '<f8' })
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
  group.create_dataset({ name, data, shape: [n, 4], dtype: '<f8' })
}

// ── Live contact map ──────────────────────────────────────────────────────────

function buildLcmvArray(xs, ys, zs) {
  const n = xs.length
  const data = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    data[i * 3]     = xs[i]
    data[i * 3 + 1] = ys[i]
    data[i * 3 + 2] = zs[i]
  }
  return { data, shape: [n, 3] }
}
