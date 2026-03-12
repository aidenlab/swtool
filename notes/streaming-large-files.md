# Streaming Large Files in the Browser

Technical notes on the chunked streaming architecture used in swtool for processing large files (tested with a 1.4 GB .swt text file) without exhausting browser memory. These techniques are general-purpose and applicable to any browser app that needs to parse or transform large text or binary files.

## The Problem

Naive approaches to file loading fail at scale:

- **Local files:** `FileReader.readAsText(file)` or `await file.text()` reads the entire file into a single JavaScript string. For a 1.4 GB file, this requires ~2.8 GB of heap (UTF-16 encoding) plus whatever the parsed output consumes. The browser tab will likely crash or become unresponsive.

- **Network files:** `await fetch(url).then(r => r.text())` has the same problem — the full response body is buffered into a string on the main thread. For large files this freezes the UI during download and then again during parsing.

Both approaches also block the main thread during parsing, freezing the UI for the entire duration.

## Architecture Overview

The solution combines two browser platform features:

1. **ReadableStream** — chunked reading that keeps only one chunk in memory at a time
2. **Web Workers** — off-main-thread execution so the UI stays responsive

```
Main Thread                          Worker Thread
─────────────                        ─────────────
postMessage({file})  ───────────►    file.stream()
       or                                 │
postMessage({url})   ───────────►    fetch(url) → resp.body
                                          │
                                          ▼
  UI spinner runs              ReadableStream (binary chunks)
  freely while                        │
  worker is busy               TextDecoderStream (text chunks)
                                          │
                                    line-by-line parse
                                    (remainder pattern)
                                          │
                                          ▼
                                    structured result
                                          │
◄──────────────── postMessage({bytes}) ◄──┘
```

## Technique 1: Streaming Local Files

The `File` object implements `.stream()`, which returns a `ReadableStream` of `Uint8Array` chunks. The browser controls chunk size (typically 16–64 KB). Piping through `TextDecoderStream` converts binary chunks to text incrementally.

```js
async function parseFileStreaming(file) {
  const stream = file.stream().pipeThrough(new TextDecoderStream())
  let remainder = ''

  for await (const chunk of stream) {
    const text = remainder + chunk
    const lines = text.split(/\r?\n/)

    // The last element may be an incomplete line split across chunks.
    // Save it and prepend it to the next chunk.
    remainder = lines.pop()

    for (const line of lines) {
      processLine(line)
    }
  }

  // Process any trailing text after the stream ends
  if (remainder.trim()) {
    processLine(remainder)
  }
}
```

### The Remainder Pattern

This is the key detail that makes line-by-line streaming work correctly. When a ReadableStream delivers chunks, chunk boundaries fall at arbitrary byte offsets — they do not align with newline characters. A single line of text can be split across two consecutive chunks:

```
Chunk N:    "chr1\t1000\t2000\t1.5\t2.3\t"     ← incomplete line
Chunk N+1:  "4.7\nchr1\t2000\t3000\t..."        ← rest of that line + more
```

The pattern:
1. Prepend the saved `remainder` to the new chunk
2. Split on newlines
3. `lines.pop()` removes and saves the last element (potentially incomplete)
4. Process all complete lines
5. On the next iteration, the remainder is prepended again

This guarantees every line is processed exactly once and always complete.

## Technique 2: Streaming Network Files

`fetch()` returns a `Response` whose `.body` property is a `ReadableStream` — the same interface as `File.stream()`. This means the identical parsing code works for both local and network files.

```js
async function parseUrlStreaming(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  // resp.body is a ReadableStream — same as file.stream()
  const stream = resp.body.pipeThrough(new TextDecoderStream())
  // ... identical remainder pattern as above
}
```

The critical difference from the naive approach: `resp.body` streams data as it arrives from the network. The browser never buffers the full response — each chunk is decoded, parsed, and discarded before the next arrives.

### Generalizing the Parser

To avoid duplicating code, the parser can accept either a `File` or a `ReadableStream`:

```js
async function parseStreaming(fileOrStream) {
  const byteStream = (fileOrStream instanceof ReadableStream)
    ? fileOrStream
    : fileOrStream.stream()

  const stream = byteStream.pipeThrough(new TextDecoderStream())
  // ... remainder pattern
}
```

The caller decides the source:

```js
// Local file
const parsed = await parseStreaming(file)

// Network file
const resp = await fetch(url)
const parsed = await parseStreaming(resp.body)
```

## Technique 3: Web Worker Isolation

Even with streaming, parsing a large file is CPU-intensive. Running it on the main thread freezes the UI — no spinner animations, no button clicks, no cancel. A Web Worker moves all of this off the main thread.

### Worker Code

```js
// parser.worker.js
import { parseStreaming } from './parser.js'
import { transform }      from './transform.js'

self.onmessage = async ({ data: { file, url, mode } }) => {
  try {
    let source
    if (url) {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      source = resp.body
    } else {
      source = file
    }

    const parsed = await parseStreaming(source)
    const bytes  = await transform(parsed, mode)

    // Transfer the buffer (zero-copy) back to the main thread
    self.postMessage({ ok: true, bytes }, [bytes.buffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err.message })
  }
}
```

### Main Thread Orchestration

```js
function runInWorker(msg) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./parser.worker.js', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = ({ data }) => {
      worker.terminate()
      if (data.ok) resolve(data.bytes)
      else reject(new Error(data.error))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message ?? 'Worker failed'))
    }
    worker.postMessage(msg)
  })
}

// Local file — File object is transferable to workers
const bytes = await runInWorker({ file, mode })

// Network file — URL string is sent; worker fetches and streams
const bytes = await runInWorker({ url, mode })
```

### Why `fetch()` Inside the Worker?

For network files, the fetch must happen inside the worker, not on the main thread. If you fetched on the main thread, you'd need to transfer the response body to the worker — but `ReadableStream` is not transferable across the worker boundary in most browsers. By fetching inside the worker, the entire pipeline (network I/O, decoding, parsing, transformation) runs off the main thread.

`File` objects, by contrast, are structured-cloneable and can be sent to workers via `postMessage`.

## Technique 4: Transferable Buffers (Zero-Copy Return)

When the worker sends the result back, it uses the transfer list to avoid copying:

```js
self.postMessage({ ok: true, bytes }, [bytes.buffer])
```

The second argument `[bytes.buffer]` transfers ownership of the `ArrayBuffer` to the main thread. This is a zero-copy operation — the buffer is not duplicated. After the transfer, the worker can no longer access that buffer (it becomes detached/zero-length).

For a large output file, this avoids doubling peak memory usage.

## Memory Profile

For a 1.4 GB text file producing a ~300 MB output:

| Approach | Peak Memory | Main Thread Blocked |
|----------|------------|-------------------|
| Naive (`file.text()` + parse) | ~3–4 GB | Entire duration |
| Streaming on main thread | ~500 MB | Entire parse duration |
| Streaming in worker | ~500 MB | None (UI responsive) |

The streaming approach keeps memory proportional to the accumulated output data structures (maps, arrays) rather than the input file size.

## Browser Compatibility

All APIs used are well-supported in modern browsers:

| API | Chrome | Firefox | Safari |
|-----|--------|---------|--------|
| `File.stream()` | 76+ | 69+ | 14.1+ |
| `ReadableStream` | 43+ | 65+ | 10.1+ |
| `TextDecoderStream` | 71+ | 105+ | 14.1+ |
| `for await...of` on streams | 63+ | 57+ | 12+ |
| Web Workers (module type) | 80+ | 114+ | 15+ |
| Transferable ArrayBuffer | 17+ | 18+ | 6+ |

Firefox's late adoption of `TextDecoderStream` (version 105, released Oct 2022) is the main compatibility concern. A polyfill or manual `TextDecoder` chunk decoding can be used if older Firefox support is needed.

## Key Takeaways

1. **`File.stream()` and `Response.body` are the same interface** — write your parser once against `ReadableStream` and it works for both local and network files.

2. **The remainder pattern is essential** for correct line-by-line streaming — chunk boundaries do not respect newlines.

3. **Fetch inside the worker**, not on the main thread — `ReadableStream` cannot be transferred across the worker boundary.

4. **Transfer, don't copy** the result buffer back to the main thread with the `postMessage` transfer list.

5. **Separate staging from processing** in the UI — let the user pick/validate a file, then explicitly start conversion. This keeps the UI responsive and gives the user a cancel point before committing to a long operation.
