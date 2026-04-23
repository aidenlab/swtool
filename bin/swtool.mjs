#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { basename, resolve } from 'node:path'
import { parseSwtFile } from '../src/parser/swtParser.js'
import { convertToSw }  from '../src/hdf5Writer.js'

const USAGE = `Usage: swtool <input.swt> [options]

Options:
  -m, --mode <mode>    single_point | multi_point  (default: single_point)
  -o, --output <path>  Output .sw path (default: <input>.sw)
      --no-index       Skip _index dataset
  -h, --help           Show this help
`

function parseArgs(argv) {
  const opts = { mode: 'single_point', includeIndex: true }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') { opts.help = true }
    else if (a === '-m' || a === '--mode') { opts.mode = argv[++i] }
    else if (a === '-o' || a === '--output') { opts.output = argv[++i] }
    else if (a === '--no-index') { opts.includeIndex = false }
    else if (a.startsWith('-')) { throw new Error(`Unknown option: ${a}`) }
    else { positional.push(a) }
  }
  opts.input = positional[0]
  return opts
}

async function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) }
  catch (e) { process.stderr.write(`${e.message}\n\n${USAGE}`); process.exit(2) }

  if (opts.help || !opts.input) {
    process.stdout.write(USAGE)
    process.exit(opts.help ? 0 : 2)
  }
  if (opts.mode !== 'single_point' && opts.mode !== 'multi_point') {
    process.stderr.write(`Invalid --mode: ${opts.mode}\n`); process.exit(2)
  }

  const inputPath  = resolve(opts.input)
  const outputPath = resolve(opts.output ?? inputPath.replace(/\.swt$/i, '') + '.sw')

  const nodeStream = Readable.toWeb(
    (await import('node:fs')).createReadStream(inputPath)
  )

  const parsed = await parseSwtFile(nodeStream)
  const bytes  = await convertToSw(parsed, opts.mode, opts.includeIndex)

  await writeFile(outputPath, bytes)
  process.stderr.write(`Wrote ${outputPath} (${bytes.length} bytes)\n`)
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.stack ?? err.message}\n`)
  process.exit(1)
})
