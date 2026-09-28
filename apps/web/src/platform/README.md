# platform (lane P)

Everything that touches the browser or the device lives here: the Web Worker that
runs the sim, the Comlink bridge, the LocalHost implementation of the `Host`
interface, IndexedDB saves, and service-worker glue.

Why it is a separate folder: lane U (the interface) and lane P (the platform) are
edited by different sessions, often in parallel. Keeping the Worker and storage
code out of `src/` means a UI session can never accidentally import the sim
directly and bypass the Host seam.

Files:
- `index.ts` - the only file the interface may import: `createHost()` and types.
- `engine.ts` - `GameEngine`: sim session, clock, dummy AI. No Worker code, so it
  is tested in Node.
- `worker.ts` - exposes one `GameEngine` over Comlink.
- `localHost.ts` - `LocalHost`, the Host the interface uses; autosave.
- `saves.ts` - save slots in IndexedDB (memory store for tests).
- `pace.ts` - wall-clock milliseconds per tick.
