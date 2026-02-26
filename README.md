# swtool

Browser-based replacement for [swt2sw](https://github.com/turner/swt2sw), a Python command-line tool that converts Spacewalk text files (`.swt`) to HDF5 binary files (`.sw`). swtool includes a complete JavaScript rewrite of the Python-based HDF5 indexer from swt2sw.

No installation required for end-users — drop a `.swt` file onto the image that matches its type (ball & stick or point cloud), or use the file picker or URL. All conversion runs entirely client-side; no data is sent to a server.

## Prerequisites

- Node.js ≥ 18

## Development

```bash
npm install
npm run dev
```

Open <http://localhost:5173> in your browser.

## Production build

```bash
npm run build
```

Output is in `dist/`. Serve it from any static host.

## Usage

**Load a file** (choose one):

- **Drag and drop** — Drop a `.swt` file onto the **ball & stick** or **point cloud** image that matches your file type. The conversion mode is selected automatically.
- **File picker** — Click "Choose from file system" to browse for a file. You will then select single-point or multi-point.
- **URL** — Enter a URL and click Fetch. You will then select single-point or multi-point.

**Output options** (optional):

- **Include live contact map vertices** (single-point only) — adds LCM vertices to the output.
- **Include index for web viewing** (default: on) — adds a path-to-offset index for efficient web-based dataset access. See [docs/HDF5_INDEXING.md](docs/HDF5_INDEXING.md).

**Convert** — Click **Convert & Download** to generate and download the `.sw` file.

## .swt file format

```
##format=sw1 name=<name> genome=<genome>
chromosome	start	end	x	y	z
trace 0
chr1	1000	2000	1.23	4.56	7.89
...
trace 1
...
```

## HDF5 output structure

```
<output>.sw
├── Header/          (attrs: version, author, date, name, genome, point_type)
├── _index           (optional: gzipped path→offset index for web viewing)
├── _index_offset    (optional: root attr, offset of _index dataset)
└── <name>/
    ├── genomic_position/
    │   └── regions  (string dataset: sorted [chr, start, end])
    └── spatial_position/
        ├── t_0      (float64: shape (n,3) single-point or (n,4) multi-point)
        ├── t_1
        └── ...
```

For single-point each `t_N` has columns `x, y, z`.
For multi-point each `t_N` has columns `region_index, x, y, z`.
