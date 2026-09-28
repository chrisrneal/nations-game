# Gate 0 - Foundations: independent review

Prompt 05, 2026-09-28. Reviewed at `main` 63cd18a (after prompt 04 merged).
The reviewer did not build this code. Every result below was produced by running
it or reading it in this session; docs/PROGRESS.md was not taken as evidence.

## Verdict: **FAIL**

Seven of the eight criteria pass or are waiting only on the owner's phone.
Criterion 8 fails: seam 8 (interactions are State objects with expiry ticks) has
no code at all, so the nine seams cannot be signed off. Everything else held up
under adversarial checks, including ones the builders did not write.

To pass on re-review: seam 8 built (docs/GAPS.md, prompt 05), the harness roster
fixed (F1), and the three OWNER CHECK items reported back by the owner.

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Sim core has no UI, DOM, network or clock imports | PASS |
| 2 | 1,000 seeds give identical hashes in browser and Node | PASS |
| 3 | Dummy AI and UI use the same command API | PASS |
| 4 | Save-reload-continue matches an uninterrupted run | PASS |
| 5 | 1,000 catch-up ticks under 2 s on a mid-range phone | OWNER CHECK |
| 6 | PWA installs and runs offline on iOS and Android | OWNER CHECK |
| 7 | Owner completes three sample decisions one-handed | OWNER CHECK |
| 8 | Independent review signs off the nine seams | **FAIL** (seam 8) |

## What was run

| Command | Result |
|---------|--------|
| `npm test` | 13 files, 128 tests passed, 0 skipped (Chromium present) |
| `npm run check` | lint + typecheck of all workspaces, exit 0 |
| `npm run harness` | 20 games x 200 ticks, 22,113 commands, 0 rejected, 20 distinct end states |
| `npm run harness -- determinism` | Node repeat 1000/1000, Node vs HeadlessChrome 141 1000/1000, PASS |
| `npm run harness -- bench` | 1,000 ticks: Node median 15.2 ms, Chromium median 18.4 ms |
| `npm run build` then `npm run e2e --workspace web` | 21/21 phone checks passed at 360 px |
| GitHub Actions CI on `main` 63cd18a | success (runs `npm test`, `npm run check`, `npm run build`) |
| Reviewer's own scripts (below, not committed) | all passed |

## Criterion evidence

### 1. Sim core purity - PASS
- `grep` for `Date`, `Math.random`, `performance`, timers, `fetch`, `document`,
  `window`, `globalThis`, `process.`, `require(` in packages/sim/src and
  packages/contracts/src: only hits are in comments.
- Every import in packages/sim/src is `@nations/contracts` or a relative file.
  packages/contracts/src contains only `export type` - no runtime code, no logic.
- The guard was tested by the reviewer, not just read: a scratch
  `packages/sim/src/zz.ts` using `Date.now()`, `Math.random()` and `document`
  failed all three guards - the purity test (1 failure), ESLint (5 errors), and
  `tsc` (1 error, no DOM lib). File removed afterwards.
- No floats in sim state: `canonicalJson` throws on any non-safe-integer, so a
  float anywhere in State fails every hash.

### 2. Browser and Node determinism - PASS
- `npm run harness -- determinism`: 1000/1000 identical, Node twice and Chromium.
- **Weakness found:** the harness roster is wrong (see Findings F1). Its games are
  played by eight "nations" named after the world file's top-level keys
  (`schemaVersion`, `worldYear`, `nations`, ...), not the 17 real nations. So the
  built-in check does not cover the roster the app actually runs.
- The reviewer therefore re-ran it with the real 17-nation roster from
  `data/world-2030.json`: 1,000 seeds x 100 ticks, **1000/1000 identical** in Node
  and Chromium (Playwright, `/opt/pw-browsers/chromium`), 1000 distinct hashes.
  The criterion holds; the harness still needs fixing.
- CI would fail, not skip, if Chromium were missing (`CI` variable check in
  packages/harness/src/determinism.test.ts).

### 3. Same command API for AI and UI - PASS
- UI: tap -> `App.choose` builds a contracts `Command` -> `GameHost.submit` ->
  Comlink -> `GameEngine.submit` -> `Session.submit` (packages/sim queue).
- AI: `GameEngine.stepWithAi` -> `dummyDecide(viewFor(state, id), seed)` ->
  the same `Session.submit`. Both are validated again inside `step`.
- `GameEngine.submit` refuses any command for a nation other than the player's;
  confirmed by the reviewer (a `setController` for Mexico from a Brazil game was
  refused: "You can only act for your own nation").
- The AI reads only a `NationView` (packages/ai/src/dummy.ts); no `Math.random`.

### 4. Save-reload-continue - PASS
- Existing: fast-check property in packages/sim/src/session.test.ts (JSON round
  trip, pending commands) and engine/localHost tests.
- Reviewer's own check at the engine level, with the AI running for 16 nations:
  300 seeds, five different player nations, random game length 40-69 ticks and
  random save point, player pings every 7 ticks, and the player handing the
  nation to the caretaker at tick 10 and taking it back at tick 25. Save ->
  `JSON.stringify/parse` -> fresh engine -> continue, compared with an
  uninterrupted run: **0 mismatches of 300**.
- Loads verify the state hash and refuse newer schema versions (tests present).

### 5. Catch-up speed on a phone - OWNER CHECK
- Desktop: 15-24 ms per 1,000 ticks (8 or 17 nations).
- Reviewer ran the 17-nation benchmark in Chromium with the CPU throttled 6x (a
  rough stand-in for a mid-range phone): 132-160 ms, about 12x under budget.
- Caveat: the sim does almost nothing per tick yet (one placeholder `ping`), so
  this proves the plumbing, not Phase 1 cost. Re-measure at Gate 1.
- A real phone reading is still required: the app's **Saves** tab has a speed
  check. Pass if it shows under 2,000 ms.
- Open architect question (docs/GAPS.md, prompt 02): a game is now 60 ticks, so
  1,000 ticks is a raw stress budget, not an absence case. Reviewer treats the
  criterion as written.

### 6. PWA install and offline - OWNER CHECK
- Headless Chromium at 360 px: installable (manifest + service worker), opens
  with the network off, save / reopen offline / load continues (13 -> 15).
- `vercel.json` stops `sw.js` being cached stale; build precaches 15 entries.
- Needs a real iPhone (Safari) and a real Android (Chrome).

### 7. Three decisions one-handed - OWNER CHECK
- Headless touch run: three decisions answered, first option centred at 530-638
  px of 740 (bottom third starts at 493), no horizontal scroll on any screen.
- Only the owner can sign this off.

### 8. The nine seams - FAIL

| Seam | Result | Evidence |
|------|--------|----------|
| 1 Pure `step(state, commands) -> state + events` | PASS | packages/sim/src/step.ts: copies records, never mutates input, RNG only from `state.rng`; invalid commands become `commandRejected` events. |
| 2 Commands are the only mutation | PASS | Only `Session.advance` -> `step` changes state; UI and AI both submit Commands; step re-validates tick, shape and per-nation limit. |
| 3 Host: submit, subscribe, setPace | PASS | `LocalHost` implements them over a Comlink Worker; apps/web/src/boundary.test.ts blocks UI imports of sim, ai, Comlink, platform internals, Worker, IndexedDB. UI files import only react, contracts types, the platform entry and static world data. |
| 4 Host owns the clock; catch-up = N ticks | PASS (note) | Timers live in `GameEngine`; the sim counts ticks. `advance(n)` exists but no absence catch-up uses it yet because `live` pace is refused (logged gap). |
| 5 Determinism | PASS | Counter RNG in State with 32-bit integer maths; `canonicalOrder` sorts commands by `nationOrder` then submission; canonical-JSON hash rejects floats; Node/Chromium identical on both rosters. |
| 6 Per-nation View | PASS | `viewFor` copies other nations' public fields one by one; reviewer confirmed no other nation's `reserve` reaches the View. Engine filters events by `audience`. |
| 7 Controller slot per nation | PASS (note) | `setController` command switches human/ai/caretaker mid-game; caretaker nations are played by the AI; covered by the reviewer's save test. There are no standing policies yet for a caretaker to follow (depends on seam 8). |
| 8 Interactions are State objects with expiry ticks | **FAIL** | Nothing exists. No interaction type in packages/contracts, no field in `WorldState`, no expiry handling in `step`, no default answer, nothing in `NationView`. The three inbox cards live in React component state (`Inbox.tsx` `done` set): answers are not in State, are lost on reload, and "Decline" / "Pass" / "Ration" send no command at all. docs/ROADMAP.md lists all nine seams as "built in Phase 0". |
| 9 Saves = snapshot + command log, versioned | PASS (note) | `SimSaveFile` has `schemaVersion`, snapshot, log, `savedAtTick`, `stateHash`; migration registry with tests; load replays and verifies the hash. But the app always saves with `compact: true`, so every save on a phone has an empty command log (reviewer: log length 0 at tick 20) and cannot replay a game for a bug report. |

**Why this is a FAIL, not a waiver.** Seam 8 is the one seam D1 and D2 rest on
("nothing assumes the other side is online"), and Phase 1 trade offers in
docs/RULES.md are exactly expiring State objects with standing-policy defaults.
Building the empty mechanism now costs one prompt; retrofitting it after the
economy and AI assume synchronous answers costs far more. The reviewer does not
recommend waiving it.

## Findings (not criteria, but should be fixed)

- **F1 Harness roster is fictional** (packages/harness/src/roster.ts). It maps
  `Object.keys(data)` of the world file, so every harness game, the benchmark and
  the built-in determinism check use eight nations named after JSON keys. Logged
  in docs/GAPS.md since prompt 02 and still open. It must be fixed before any
  Gate 1 balance metric means anything.
- **F2 App saves carry no replay history** (seam 9 note above). Keep a full save
  alongside the compact one, or compact only past some age.
- **F3 `controllerChanged` events are public** (`audience: []`). In multiplayer
  this tells every rival when a human has gone away and the caretaker took over.
  Decide deliberately before Phase 5.
- **F4 The UI reads `data/world-2030.json` directly** for facts and ties. It is
  static public data, not State, so no rule is broken today; once those numbers
  change during play they must come through the View.

## Rule-breach search

| Search | Result |
|--------|--------|
| `Date` / `Math.random` in packages/sim | none (comments only) |
| `Math.random` / `Date` in packages/ai | none |
| UI importing `State`, `WorldState` or `@nations/sim` | none; UI sees `PlayerView` (= sim `NationView`) only as a type re-exported by the platform entry |
| Logic in packages/contracts | none; types only |
| Inline tunables in sim | none; `TUNABLES` only. Dummy AI's `IDLE_CHANCE_IN_4` is inline (logged gap, placeholder) |
| `Math.random` / `Date.now` in platform | `LocalHost.newGame` seed and save timestamps; allowed (host side, seed is stored in the save) |
