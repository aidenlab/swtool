import h5wasm, { FS } from 'h5wasm'
import { writeHeader }       from './converter/headerWriter.js'
import { writeRegionList }   from './converter/regionList.js'
import { writeSpatialGroup } from './converter/spatialGroup.js'
import {
  buildIndex,
  appendIndexToFile,
  getIndexDatasetOffset,
  addIndexOffsetAttribute,
} from './indexer/hdf5Indexer.js'

// FS is a live named export — null until h5wasm.ready resolves.
let readyPromise = null

function ensureReady() {
  if (!readyPromise) readyPromise = h5wasm.ready
  return readyPromise
}

/**
 * Converts parsed .swt data into an in-memory HDF5 file and returns the bytes.
 *
 * @param {{ metadata, regions, traces }} parsedData  Output of parseSwtText()
 * @param {'single_point'|'multi_point'} mode
 * @param {boolean} [includeIndex=true]  Add _index dataset for hdf5-indexed-reader
 * @returns {Promise<Uint8Array>}  Raw bytes of the .sw HDF5 file
 */
export async function convertToSw(parsedData, mode, includeIndex = true) {
  const { metadata, regions, traces } = parsedData

  await ensureReady()
  // FS live binding is now populated.

  const filename = `/${metadata.name ?? 'output'}.sw`

  // Create in-memory HDF5 file
  const file = new h5wasm.File(filename, 'w')

  // Header group
  const headerGroup = writeHeader(file, metadata)
  headerGroup.create_attribute('point_type', mode)

  // Named root group: e.g. "IMR90"
  const nameGroup = file.create_group(metadata.name ?? 'data')

  // Pass 1: genomic_position/regions
  const regionIndex = writeRegionList(nameGroup, regions)

  // Pass 2: spatial_position/t_N
  writeSpatialGroup(nameGroup, traces, regionIndex, mode)

  file.flush()
  file.close()

  // Read the bytes back from Emscripten's virtual FS
  let bytes = FS.readFile(filename)

  if (includeIndex) {
    const index = buildIndex(bytes)
    await appendIndexToFile(filename, bytes, index)
    bytes = FS.readFile(filename)
    const offset = getIndexDatasetOffset(bytes)
    if (offset != null) {
      await addIndexOffsetAttribute(filename, bytes, offset)
      bytes = FS.readFile(filename)
    }
  }

  // Clean up the virtual FS entry
  FS.unlink(filename)

  return bytes
}
