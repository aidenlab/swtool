/**
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateFileExtension(filename) {
  if (!filename.toLowerCase().endsWith('.swt')) {
    return { valid: false, error: `Expected a .swt file, got: ${filename}` }
  }
  return { valid: true }
}

/**
 * The first line must start with '##' and contain at least name= and genome=.
 */
export function validateHeader(firstLine) {
  if (!firstLine.startsWith('##')) {
    return { valid: false, error: 'File does not start with a ## metadata header line.' }
  }
  if (!firstLine.includes('name=')) {
    return { valid: false, error: 'Header is missing required key: name' }
  }
  if (!firstLine.includes('genome=')) {
    return { valid: false, error: 'Header is missing required key: genome' }
  }
  return { valid: true }
}
