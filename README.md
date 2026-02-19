# swtool

Browser-based converter for Spacewalk text files (`.swt`) to HDF5 binary files (`.sw`).

No installation required for end-users — drag and drop a `.swt` file, choose options, and download the result. All conversion runs entirely client-side; no data is sent to a server.

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

1. Drag a `.swt` file onto the drop zone (or click to browse, or paste a URL).
2. Select **Single-point** (ball & stick / ORCA-style) or **Multi-point** (point cloud / OligoSTORM-style).
3. Optionally check **Include live contact map vertices** (single-point only).
4. Click **Convert & Download** — the `.sw` file downloads automatically.

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
