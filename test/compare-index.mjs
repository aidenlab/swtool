/**
 * Compare _index datasets between Python swt2sw output and JS swtool output.
 *
 * Usage:
 *   node test/compare-index.mjs
 *
 * Prerequisite: Run extract-python-index.py first to produce *-index.json files.
 */

import { readFileSync } from 'node:fs'
import { parseSwtText } from '../src/parser/swtParser.js'
import { convertToSw } from '../src/hdf5Writer.js'
import * as hdf5 from 'jsfive'
import pako from 'pako'

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractIndex(bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const file = new hdf5.File(buf, 'test.h5')
  const indexDs = file.get('_index')
  if (!indexDs) return null
  const compressed = new Uint8Array(indexDs.value)
  const json = pako.ungzip(compressed, { to: 'string' })
  return JSON.parse(json)
}

// ── Test cases ───────────────────────────────────────────────────────────────

const tests = [
  {
    name: 'ball-and-stick (single_point)',
    swtPath: '/Users/turner/SpacewalkDevelopment/swt2sw/ball-and-stick.swt',
    pythonIndexPath: '/tmp/swt2sw-output/ball-and-stick-index.json',
    mode: 'single_point',
  },
  {
    name: 'pointcloud (multi_point)',
    swtPath: '/Users/turner/SpacewalkDevelopment/swt2sw/pointcloud-missing-genomic-regions.swt',
    pythonIndexPath: '/tmp/swt2sw-output/pointcloud-index.json',
    mode: 'multi_point',
  },
]

for (const test of tests) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`TEST: ${test.name}`)
  console.log('='.repeat(60))

  // ── Python reference (pre-extracted JSON) ──────────────────────────────
  const pythonIndex = JSON.parse(readFileSync(test.pythonIndexPath, 'utf8'))

  // ── JS swtool ─────────────────────────────────────────────────────────
  const swtText = readFileSync(test.swtPath, 'utf8')
  const parsed = parseSwtText(swtText)
  const jsBytes = await convertToSw(parsed, test.mode, true)
  const jsIndex = extractIndex(jsBytes)

  if (!jsIndex) {
    console.log('  FAIL: JS output has no _index dataset')
    continue
  }

  // ── Compare index paths ────────────────────────────────────────────────
  const pyPaths = Object.keys(pythonIndex).sort()
  const jsPaths = Object.keys(jsIndex).sort()

  console.log(`\n  Python index paths (${pyPaths.length}): ${pyPaths.join(', ')}`)
  console.log(`  JS index paths (${jsPaths.length}): ${jsPaths.join(', ')}`)

  const pyPathSet = new Set(pyPaths)
  const jsPathSet = new Set(jsPaths)
  const missingInJs = pyPaths.filter(p => !jsPathSet.has(p))
  const extraInJs = jsPaths.filter(p => !pyPathSet.has(p))

  if (missingInJs.length) {
    console.log(`\n  PATHS MISSING in JS: ${missingInJs.join(', ')}`)
  }
  if (extraInJs.length) {
    console.log(`\n  EXTRA PATHS in JS: ${extraInJs.join(', ')}`)
  }
  if (!missingInJs.length && !extraInJs.length) {
    console.log(`\n  PATH MATCH: All ${pyPaths.length} paths match`)
  }

  // ── Compare child keys per path ────────────────────────────────────────
  let childKeyMismatches = 0
  for (const path of pyPaths) {
    if (!jsIndex[path]) continue
    const pyChildren = Object.keys(pythonIndex[path]).sort()
    const jsChildren = Object.keys(jsIndex[path]).sort()
    if (JSON.stringify(pyChildren) !== JSON.stringify(jsChildren)) {
      childKeyMismatches++
      if (childKeyMismatches <= 5) {
        console.log(`\n  CHILD KEY MISMATCH at "${path}":`)
        console.log(`    Python (${pyChildren.length}): ${pyChildren.slice(0, 8).join(', ')}${pyChildren.length > 8 ? '...' : ''}`)
        console.log(`    JS     (${jsChildren.length}): ${jsChildren.slice(0, 8).join(', ')}${jsChildren.length > 8 ? '...' : ''}`)
      }
    }
  }
  if (childKeyMismatches === 0) {
    console.log(`  CHILD KEY MATCH: All child keys match across all paths`)
  } else {
    console.log(`\n  CHILD KEY MISMATCHES: ${childKeyMismatches} paths have different child keys`)
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const structureMatch = !missingInJs.length && !extraInJs.length && childKeyMismatches === 0
  console.log(`\n  RESULT: ${structureMatch ? 'PASS — Index structure matches' : 'FAIL — Index structure differs'}`)
}

console.log('\nDone.')
