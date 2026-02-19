# HDF5 Indexing in swtool

This document captures the context and implementation of the HDF5 indexing feature added to swtool. It was developed in conversation starting from the [hdf5-indexer](https://github.com/jrobinso/hdf5-indexer) Python project.

## What It Does

When "Include index for web viewing" is checked (default), swtool adds two things to the output `.sw` file:

1. **`_index` dataset** — A gzipped JSON map of HDF5 object paths to file offsets
2. **`_index_offset` root attribute** — The file offset of the `_index` dataset

This enables [hdf5-indexed-reader](https://github.com/jrobinso/hdf5-indexed-reader) to load individual datasets from large remote files via HTTP range requests without traversing the HDF5 object tree.

## Architecture

```
Create HDF5 (h5wasm) → Read bytes → Build index (jsfive) → Gzip (pako)
    → Append _index (h5wasm) → Get offset (jsfive) → Add _index_offset (h5wasm) → Return bytes
```

- **jsfive** — Pure JS HDF5 reader; exposes `_dataobjects.offset` for each object
- **h5wasm** — HDF5 read/write via WebAssembly; used to create the file and append the index
- **pako** — Gzip compression for the index JSON

## Index Format

- **Structure**: `{ "/path/to/group": { "child1": offset, "child2": offset }, ... }`
- **Storage**: Gzipped JSON stored as a byte array (`dtype: '<B'`, `shape: [compressedLength]`)

### Format Note (Option A)

The Python hdf5-indexer uses an opaque dataset (single element containing the blob). h5wasm does not support opaque dtype in `create_dataset`, so we use a flat byte array instead. If hdf5-indexed-reader expects `dataset[0]` (opaque element), it may need a small update to also accept `dataset.value` (full byte array). Document as a format variant if needed.

## Key Files

| File | Purpose |
|------|---------|
| `src/indexer/hdf5Indexer.js` | `buildIndex`, `appendIndexToFile`, `getIndexDatasetOffset`, `addIndexOffsetAttribute` |
| `src/hdf5Writer.js` | Calls indexer after creating HDF5 when `includeIndex` is true |
| `src/main.js` | Passes `includeIndex` from checkbox to `convertToSw` |

## Dependencies

- **jsfive** (^0.3.7) — HDF5 reading, offset extraction
- **pako** (^2.1.0) — Gzip compression

## Original Plan

The implementation followed a plan created during the discussion. The plan document was stored at:

`~/.cursor/plans/add_hdf5_indexing_to_swtool_90d8686d.plan.md`

You can copy it into the project if desired:

```bash
cp ~/.cursor/plans/add_hdf5_indexing_to_swtool_90d8686d.plan.md docs/
```

## Testing

1. Convert a `.swt` file with indexing enabled (e.g. `testFiles/ball-and-stick.swt`)
2. Verify `_index` dataset and `_index_offset` attribute exist (e.g. via `h5dump` or a Node script)
3. Optionally load the output with hdf5-indexed-reader to confirm compatibility

## Future Considerations

- **Reader compatibility**: If hdf5-indexed-reader does not support the byte-array format, either contribute opaque dtype support to h5wasm or add format detection to the reader
- **External index**: hdf5-indexer can output index to a separate JSON file; hdf5-indexed-reader supports `indexURL`, `indexPath`, `indexFile` for that case
