# Plan: Add "Open in Spacewalk" Button to swtool

## Context

After swtool converts a .swt file to .sw format, the user currently sees a "Download" button. We want to add an "Open in Spacewalk" button alongside it that pipes the in-memory .sw file directly into Spacewalk via `postMessage` — no file download needed.

Spacewalk (on branch `sw-file-as-url-paramater`) already has the receiving side implemented: a `postMessage` listener that accepts `{ type: 'spacewalk-load', bytes: Uint8Array, filename: string }` and feeds it into the existing file loading pipeline.

## COOP/COEP Header Issue

swtool's `vite.config.js` currently sets:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`COOP: same-origin` severs the `window.opener` / `window.open()` relationship for cross-origin windows. This would make `postMessage` between swtool and Spacewalk impossible.

**Resolution:** These headers can be removed. They were added as a precaution for h5wasm (WebAssembly), but h5wasm 0.9.0 does not use `SharedArrayBuffer` or threads — confirmed by searching the library source. Removing the headers has no functional impact on swtool's conversion pipeline.

## Protocol

```
swtool (localhost:5174)                  Spacewalk (localhost:5173)
  │                                          │
  │  user clicks "Open in Spacewalk"         │
  │                                          │
  │  window.open('http://localhost:5173/')    │
  │ ──────────────────────────────────────►  │
  │                                          │
  │           (Spacewalk initializes...)      │
  │                                          │
  │  postMessage({ type: 'spacewalk-ready' })│
  │ ◄──────────────────────────────────────  │
  │                                          │
  │  postMessage({                           │
  │    type: 'spacewalk-load',               │
  │    bytes: Uint8Array,                    │
  │    filename: 'output.sw'                 │
  │  })                                      │
  │ ──────────────────────────────────────►  │
  │                                          │
  │                         (file loads, 3D  │
  │                          structure shown) │
```

## Files to Modify

### 1. `vite.config.js` — Remove COOP/COEP headers

Remove the `server.headers` block. h5wasm does not require cross-origin isolation.

**Before:**
```javascript
server: {
    headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
    },
},
```

**After:** Remove the entire `server` property.

### 2. `src/ui.js` — Add "Open in Spacewalk" button to `showSuccess()`

Add a second button next to the existing download link. Store the `bytes` and `filename` so the click handler can access them.

**Current HTML in `showSuccess()`:**
```html
<a id="download-link" href="${url}" download="${outputFilename}"
   class="btn btn-sm btn-success text-nowrap">
  Download ${outputFilename}
</a>
```

**New HTML:**
```html
<div class="d-flex gap-2">
  <a id="download-link" href="${url}" download="${outputFilename}"
     class="btn btn-sm btn-success text-nowrap">
    Download ${outputFilename}
  </a>
  <button id="open-spacewalk-btn" type="button"
          class="btn btn-sm btn-primary text-nowrap">
    Open in Spacewalk
  </button>
</div>
```

Add a click handler for the button that calls a new function `openInSpacewalk(bytes, filename)`.

### 3. `.env` — Add `VITE_SPACEWALK_URL` environment variable

Create a `.env` file in the project root:

```
VITE_SPACEWALK_URL=https://aidenlab.org/spacewalk/
```

For local development, edit `.env` to point to the local Spacewalk dev server:

```
VITE_SPACEWALK_URL=http://localhost:5173/
```

Vite automatically exposes `VITE_`-prefixed env vars via `import.meta.env`. No changes to `vite.config.js` needed for this.

Add `.env` to `.gitignore` so each developer can configure their own URL without affecting others. Optionally commit a `.env.example` as a template.

### 4. `src/ui.js` — Add `openInSpacewalk()` function

```javascript
function openInSpacewalk(bytes, filename) {
    const spacewalkURL = import.meta.env.VITE_SPACEWALK_URL;
    const spacewalkWindow = window.open(spacewalkURL);

    // Wait for Spacewalk to signal readiness, then send the file
    window.addEventListener('message', function handler(event) {
        if (event.data?.type !== 'spacewalk-ready') return;
        window.removeEventListener('message', handler);
        spacewalkWindow.postMessage(
            { type: 'spacewalk-load', bytes, filename },
            '*'
        );
    });
}
```

### 5. `netlify.toml` or `public/_headers` — Remove COOP/COEP from production

If swtool's Netlify deployment also sets these headers, they need to be removed there too. Check whether a `netlify.toml` or `_headers` file exists.

## Local Testing Setup

1. **Spacewalk** (terminal 1): `cd spacewalk && npm run dev` → runs on `localhost:5173`
2. **swtool** (terminal 2): `cd swtool && npm run dev` → runs on `localhost:5174` (Vite auto-increments the port)
3. Open swtool at `http://localhost:5174`
4. Convert a .swt file
5. Click "Open in Spacewalk"
6. Spacewalk opens in a new tab and renders the 3D structure

## Production Deployment

Set the `VITE_SPACEWALK_URL` environment variable in Netlify's site settings to `https://aidenlab.org/spacewalk/`. Both apps are on Netlify, different domains — `postMessage` works cross-origin by design.

## What This Does NOT Change

- The conversion pipeline (parser, h5wasm, worker) — untouched
- The existing download button — still works as before
- swtool's overall UI layout and flow
