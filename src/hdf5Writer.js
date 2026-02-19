import h5wasm, { FS } from 'h5wasm'
import { writeHeader }       from './converter/headerWriter.js'
import { writeRegionList }   from './converter/regionList.js'
import { writeSpatialGroup } from './converter/spatialGroup.js'

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
 * @param {boolean} liveContactMap
 * @returns {Promise<Uint8Array>}  Raw bytes of the .sw HDF5 file
 */
export async function convertToSw(parsedData, mode, liveContactMap) {
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
  const lcmv = writeSpatialGroup(nameGroup, traces, regionIndex, mode, liveContactMap)

  // Optional live contact map vertices (single-point only)
  if (lcmv) {
    nameGroup.create_dataset({
      name:  'live_contact_map_vertices',
      data:  lcmv.data,
      shape: lcmv.shape,
      dtype: '<d',
    })
  }

  file.flush()
  file.close()

  // Read the bytes back from Emscripten's virtual FS
  const bytes = FS.readFile(filename)

  // Clean up the virtual FS entry
  FS.unlink(filename)

  return bytes
}
