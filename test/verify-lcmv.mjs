/**
 * Verify live_contact_map_vertices bake (v1) in JS swtool output.
 *
 * Checks for ball-and-stick (single_point):
 *   - Header.live_contact_map_vertices_version == 1
 *   - <name>/live_contact_map_vertices exists with shape (trace_count, trace_length, 3) float32
 *   - baked[i][region_index] matches the per-trace t_i row for that region,
 *     NaN where the trace has no entry for that region.
 *
 * Checks for pointcloud (multi_point):
 *   - No live_contact_map_vertices dataset, no version attribute (phase 2).
 *
 * Usage:
 *   node test/verify-lcmv.mjs
 */

import { readFileSync } from 'node:fs'
import { parseSwtText } from '../src/parser/swtParser.js'
import { convertToSw } from '../src/hdf5Writer.js'
import * as hdf5 from 'jsfive'

function openJsFive(bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return new hdf5.File(buf, 'test.h5')
}

function nanEqualClose(a, b, eps = 1e-5) {
  if (Number.isNaN(a) && Number.isNaN(b)) return true
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  return Math.abs(a - b) <= eps
}

const tests = [
  {
    name: 'ball-and-stick (single_point)',
    swtPath: '/Users/turner/SpacewalkDevelopment/swt2sw/ball-and-stick.swt',
    mode: 'single_point',
    expectBake: true,
  },
  {
    name: 'pointcloud (multi_point)',
    swtPath: '/Users/turner/SpacewalkDevelopment/swt2sw/pointcloud-missing-genomic-regions.swt',
    mode: 'multi_point',
    expectBake: false,
  },
]

let anyFail = false

for (const test of tests) {
  console.log(`\n${'='.repeat(60)}\nTEST: ${test.name}\n${'='.repeat(60)}`)

  const swtText = readFileSync(test.swtPath, 'utf8')
  const parsed = parseSwtText(swtText)
  const jsBytes = await convertToSw(parsed, test.mode, true)
  const file = openJsFive(jsBytes)

  const name = parsed.metadata.name ?? 'data'
  const nameGroup = file.get(name)
  const header = file.get('Header')
  let bake = null
  try { bake = nameGroup.get('live_contact_map_vertices') } catch { /* absent */ }
  const versionAttr = header?.attrs?.live_contact_map_vertices_version

  if (!test.expectBake) {
    const passNoBake = bake == null
    const passNoVersion = versionAttr == null
    console.log(`  bake absent:     ${passNoBake ? 'PASS' : 'FAIL (dataset present)'}`)
    console.log(`  version absent:  ${passNoVersion ? 'PASS' : `FAIL (got ${JSON.stringify(versionAttr)})`}`)
    if (!passNoBake || !passNoVersion) anyFail = true
    continue
  }

  if (!bake) { console.log('  FAIL: live_contact_map_vertices dataset missing'); anyFail = true; continue }

  // jsfive attr may be wrapped {value, …} or be a primitive — normalize.
  const versionValue = versionAttr?.value ?? versionAttr
  const versionOk = Number(versionValue) === 1
  console.log(`  version == 1:    ${versionOk ? 'PASS' : `FAIL (got ${JSON.stringify(versionAttr)})`}`)
  if (!versionOk) anyFail = true

  const traceCount = parsed.traces.size
  const traceLength = parsed.regions.length
  const shapeOk =
    bake.shape?.length === 3 &&
    bake.shape[0] === traceCount &&
    bake.shape[1] === traceLength &&
    bake.shape[2] === 3
  console.log(`  shape (${traceCount}, ${traceLength}, 3): ${shapeOk ? 'PASS' : `FAIL (got ${JSON.stringify(bake.shape)})`}`)
  if (!shapeOk) anyFail = true

  // dtype float32 — jsfive exposes via dtype or as Float32Array value
  const dtypeOk = bake.dtype === '<f4' || bake.value instanceof Float32Array
  console.log(`  dtype float32:   ${dtypeOk ? 'PASS' : `FAIL (dtype=${bake.dtype})`}`)
  if (!dtypeOk) anyFail = true

  // Build expected: regions order, then for each trace fill from points.
  const regionKey = (chr, start, end) => `${chr}%${start}%${end}`
  const regionIdx = new Map()
  parsed.regions.forEach(([c, s, e], i) => regionIdx.set(regionKey(c, s, e), i))

  const sortedTraceIndices = [...parsed.traces.keys()].sort((a, b) => a - b)
  const baked = bake.value // flat typed array, row-major (traceCount, traceLength, 3)

  let mismatches = 0
  const totalCells = traceCount * traceLength * 3
  for (let ti = 0; ti < traceCount; ti++) {
    const points = parsed.traces.get(sortedTraceIndices[ti])
    const expected = new Float32Array(traceLength * 3)
    expected.fill(NaN)
    for (const { chr, start, end, x, y, z } of points) {
      const ri = regionIdx.get(regionKey(chr, start, end))
      if (ri == null) continue
      expected[ri * 3]     = x
      expected[ri * 3 + 1] = y
      expected[ri * 3 + 2] = z
    }
    const rowBase = ti * traceLength * 3
    for (let j = 0; j < expected.length; j++) {
      if (!nanEqualClose(baked[rowBase + j], expected[j])) {
        mismatches++
        if (mismatches <= 5) {
          console.log(`    mismatch trace=${sortedTraceIndices[ti]} off=${j}: baked=${baked[rowBase + j]} expected=${expected[j]}`)
        }
      }
    }
  }
  const valuesOk = mismatches === 0
  console.log(`  values match:    ${valuesOk ? `PASS (${totalCells} cells)` : `FAIL (${mismatches} mismatches)`}`)
  if (!valuesOk) anyFail = true
}

console.log(`\n${anyFail ? 'OVERALL: FAIL' : 'OVERALL: PASS'}`)
process.exit(anyFail ? 1 : 0)
