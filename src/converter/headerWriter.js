/**
 * Creates the HDF5 Header group and writes metadata attributes.
 *
 * @param {import('h5wasm').File} file
 * @param {Object} metadata - Parsed from the ## line (name, genome, format, …)
 * @returns {import('h5wasm').Group} The Header group (so callers can set point_type later)
 */
export function writeHeader(file, metadata) {
  const headerGroup = file.create_group('Header')

  const attrs = {
    version: '1.0.0',
    author:  'Douglass Turner',
    date:    new Date().toISOString(),
    ...metadata,
  }

  for (const [key, value] of Object.entries(attrs)) {
    headerGroup.create_attribute(key, value)
  }

  return headerGroup
}
