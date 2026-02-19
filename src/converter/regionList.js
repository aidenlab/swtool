/**
 * Writes the genomic_position/regions dataset and returns a region-index lookup.
 *
 * regions is a sorted array of [chr, start, end] (all strings).
 *
 * @param {import('h5wasm').Group} nameGroup  The <name> group inside the HDF5 file.
 * @param {string[][]} regions
 * @returns {Map<string, number>}  key → 0-based index in regions array
 */
export function writeRegionList(nameGroup, regions) {
  const gpGroup = nameGroup.create_group('genomic_position')

  // Flatten to a 1-D string array; h5wasm uses shape to interpret as 2-D.
  const flat = regions.flat()

  gpGroup.create_dataset({
    name: 'regions',
    data: flat,
    shape: [regions.length, 3],
  })

  // Build the region → index lookup used by spatialGroup
  const regionIndex = new Map()
  for (let i = 0; i < regions.length; i++) {
    const [chr, start, end] = regions[i]
    regionIndex.set(`${chr}%${start}%${end}`, i)
  }
  return regionIndex
}
