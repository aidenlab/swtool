/**
 * HDF5 indexer: builds path-to-offset index for hdf5-indexed-reader compatibility.
 * Uses jsfive to read structure and h5wasm to append the index dataset.
 */

import * as hdf5 from 'jsfive'
import pako from 'pako'
import h5wasm, { FS } from 'h5wasm'

let h5wasmReady = null

async function ensureH5Ready() {
  if (!h5wasmReady) h5wasmReady = h5wasm.ready
  return h5wasmReady
}

/**
 * Build index mapping group paths to child name -> file offset.
 * Matches Python hdf5-indexer format: { "/path": { "child1": offset, ... }, ... }
 *
 * @param {Uint8Array} bytes - Raw HDF5 file bytes
 * @returns {Promise<Object>} Index object
 */
export function buildIndex(bytes) {
  const buf =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

  const file = new hdf5.File(buf, 'indexed.h5')

  const index = {}

  function indexChildren(group) {
    const children = {}
    for (const key of group.keys) {
      const child = group.get(key)
      children[key] = child._dataobjects.offset
      if (typeof child.get === 'function') {
        indexChildren(child)
      }
    }
    index[group.name] = children
  }

  indexChildren(file)
  return index
}

/**
 * Append _index dataset (gzipped JSON) to the HDF5 file in virtual FS.
 *
 * @param {string} filename - Path in virtual FS
 * @param {Uint8Array} bytes - Current file bytes
 * @param {Object} index - Index object from buildIndex
 */
export async function appendIndexToFile(filename, bytes, index) {
  await ensureH5Ready()

  const indexJson = JSON.stringify(index)
  const compressed = pako.gzip(new TextEncoder().encode(indexJson))

  FS.writeFile(filename, bytes)
  const file = new h5wasm.File(filename, 'a')

  file.create_dataset({
    name: '_index',
    data: compressed,
    shape: [compressed.length],
    dtype: '<B',
  })

  file.flush()
  file.close()
}

/**
 * Get the file offset of the _index dataset using jsfive.
 *
 * @param {Uint8Array} bytes - HDF5 file bytes (must already contain _index)
 * @returns {number} File offset of _index dataset
 */
export function getIndexDatasetOffset(bytes) {
  const buf =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

  const file = new hdf5.File(buf, 'indexed.h5')
  const dset = file.get('_index')
  if (!dset) return null
  return dset._dataobjects.offset
}

/**
 * Add _index_offset root attribute to the HDF5 file.
 *
 * @param {string} filename - Path in virtual FS
 * @param {Uint8Array} bytes - Current file bytes
 * @param {number} offset - File offset of _index dataset
 */
export async function addIndexOffsetAttribute(filename, bytes, offset) {
  await ensureH5Ready()

  FS.writeFile(filename, bytes)
  const file = new h5wasm.File(filename, 'a')
  file.create_attribute('_index_offset', offset)
  file.flush()
  file.close()
}
