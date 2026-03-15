# Spacewalk Integration: Direct File Handoff via postMessage

## Overview

swtool can send a converted .sw file directly to [Spacewalk](https://aidenlab.org/spacewalk) without the user ever downloading the file. After conversion, the "Open in Spacewalk" button opens Spacewalk in a new tab and transfers the in-memory file bytes using the browser's `postMessage` API.

This is a general-purpose pattern: any web application that generates Spacewalk-compatible files (.sw, .swb, .cndb) can adopt the same protocol to offer a one-click "Open in Spacewalk" experience.

## Why postMessage

The converted .sw file exists only in memory — it was generated client-side by h5wasm and never uploaded to a server. Traditional approaches (URL parameters, file downloads) don't work for in-memory data across browser tabs. The `postMessage` API solves this: it allows two browser windows to exchange structured data directly, even across different origins.

Alternatives considered and rejected:

| Approach | Why it doesn't fit |
|----------|-------------------|
| `?file=<url>` parameter | Requires the file to be hosted at a public URL |
| Download then manual load | Two manual steps — poor UX |
| Temporary upload to S3/cloud | Requires server infrastructure, adds latency and cost |
| Shared localStorage/IndexedDB | Only works same-origin; swtool and Spacewalk are different domains |

## Protocol

### Message Flow

```
swtool                                       Spacewalk
  │                                             │
  │  1. window.open(spacewalkURL)               │
  │ ─────────────────────────────────────────►  │
  │                                             │
  │              (Spacewalk initializes...)      │
  │                                             │
  │  2. { type: 'spacewalk-ready' }             │
  │ ◄─────────────────────────────────────────  │
  │                                             │
  │  3. { type: 'spacewalk-load',               │
  │       bytes: Uint8Array,                    │
  │       filename: 'output.sw' }               │
  │ ─────────────────────────────────────────►  │
  │                                             │
  │              (3D structure renders)          │
```

1. **swtool opens Spacewalk** in a new tab via `window.open()`.
2. **Spacewalk signals readiness** by posting `{ type: 'spacewalk-ready' }` back to `window.opener` after initialization completes.
3. **swtool sends the file** as a `{ type: 'spacewalk-load', bytes, filename }` message. Spacewalk wraps the bytes in a `File` object and feeds it into its existing file loading pipeline.

### Message Definitions

**`spacewalk-ready`** (Spacewalk → opener)

| Field | Value |
|-------|-------|
| `type` | `'spacewalk-ready'` |

Sent once after Spacewalk's initialization completes. Contains no payload — it's purely a readiness signal.

**`spacewalk-load`** (sender → Spacewalk)

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Must be `'spacewalk-load'` |
| `bytes` | `Uint8Array` | Raw file bytes |
| `filename` | `string` | Filename with extension (e.g., `'output.sw'`). The extension determines which parser/datasource Spacewalk uses. |

## Implementation in swtool

### Sending side (`src/ui.js`)

The `openInSpacewalk()` function handles the entire handoff:

```javascript
function openInSpacewalk(bytes, filename) {
  const spacewalkURL = import.meta.env.VITE_SPACEWALK_URL
  const spacewalkWindow = window.open(spacewalkURL)

  window.addEventListener('message', function handler(event) {
    if (event.data?.type !== 'spacewalk-ready') return
    window.removeEventListener('message', handler)
    spacewalkWindow.postMessage(
      { type: 'spacewalk-load', bytes, filename },
      '*'
    )
  })
}
```

The function is called when the user clicks the "Open in Spacewalk" button in the success UI. The `bytes` (Uint8Array) are the same ones produced by the conversion worker — they're held in the closure, never written to disk.

### Configuration

The Spacewalk URL is read from the `VITE_SPACEWALK_URL` environment variable, set in `.env`:

```
# Local development
VITE_SPACEWALK_URL=http://localhost:5173/

# Production
VITE_SPACEWALK_URL=https://aidenlab.org/spacewalk/
```

Vite injects `VITE_`-prefixed variables at build time via `import.meta.env`.

## COOP/COEP Headers

swtool previously set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in `vite.config.js`. These headers were added as a precaution for h5wasm (WebAssembly), but h5wasm 0.9.0 does not use SharedArrayBuffer or threads — confirmed by searching the library source.

The headers were removed because `COOP: same-origin` severs the `window.opener` / `window.open()` relationship for cross-origin windows, which would make the postMessage handoff impossible.

## Adopting This Pattern in Other Tools

Any web application that generates Spacewalk-compatible files can implement the same protocol:

1. Open Spacewalk in a new tab: `window.open('https://aidenlab.org/spacewalk/')`
2. Listen for the `spacewalk-ready` message
3. Send `{ type: 'spacewalk-load', bytes: Uint8Array, filename: string }` to the opened window
4. Ensure your app does **not** set `Cross-Origin-Opener-Policy: same-origin` (use `same-origin-allow-popups` or omit the header entirely)
