# Developer Notes

## Architecture

**Data flow:** File Input → Parse → Convert to HDF5 → (Optional) Index → Download

### Modules

| Module | Location | Role |
|--------|----------|------|
| Orchestration | `src/main.js` | Wires drop zones, file picker, URL fetch, state |
| UI state | `src/ui.js` | All DOM mutations centralized here |
| Parser | `src/parser/swtParser.js` | Converts `.swt` text → `{metadata, regions[], traces{}}` |
| Validation | `src/parser/validation.js` | File extension + header checks |
| HDF5 Writer | `src/hdf5Writer.js` | Creates in-memory HDF5 via h5wasm, delegates to converters |
| Header Writer | `src/converter/headerWriter.js` | Writes metadata to HDF5 `Header` group |
| Region List | `src/converter/regionList.js` | Writes `genomic_position/regions` dataset |
| Spatial Group | `src/converter/spatialGroup.js` | Writes `spatial_position/t_N` datasets (single or multi-point) |
| HDF5 Indexer | `src/indexer/hdf5Indexer.js` | Builds path→offset map, gzips it, appends `_index` dataset |

### HDF5 Indexer

The HDF5 indexer (`src/indexer/hdf5Indexer.js`) is a complete JavaScript rewrite of the Python-based indexer from [swt2sw](https://github.com/turner/swt2sw). It uses jsfive (a pure-JS HDF5 reader) to read back the generated HDF5 bytes, build a path→offset map, gzip it, and append it as a `_index` dataset — reproducing the same index format as the original Python implementation.

### Key architectural notes

- h5wasm uses an Emscripten virtual filesystem — HDF5 files are written to a virtual path in memory, then read back as bytes for download.
- jsfive (pure-JS HDF5 reader) is used *separately* by the indexer to read back the written bytes and build the index.
- The indexer appends a `_index` dataset and `_index_offset` attribute to the HDF5 file after initial creation.
- Vite config sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers (required for SharedArrayBuffer / WebAssembly).
- h5wasm is excluded from Vite's dependency optimization (`optimizeDeps.exclude`).
