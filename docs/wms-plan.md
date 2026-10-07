# WMS plan: a warehouse management system on the phone

The owner's request: a WMS layer that makes the game feel like running a real
distribution operation. Orders with order lines, picking status and live
activity, in a dense operational grid (Manhattan / Blue Yonder / SAP EWM, on a
380 px phone). One slice per run; each run reads this file, does the first
slice not marked DONE, and marks it.

## Reading of the request (decided in run 1, check with the owner)
The request was written for the Nations game ("play as a nation in 2030,
trade deals, aid, joint projects, relations"). That game was retired on
2026-10-01 (P1, P10) and this repo is now **Warehouse Idle** (W1): no nations,
trade deals, aid, joint projects or diplomacy exist any more. Following
CLAUDE.md (pick the reading most consistent with docs/ROADMAP.md, say so,
proceed), the WMS is built into the warehouse game, where it fits naturally:

- **Destination nation -> destination country.** Every WMS order ships to a
  customer in a real country, shown as its 3-letter ISO code and flag.
- **Source (trade deal / aid / joint project) -> customer account.** The
  contract the order came from (Local shops ... Everything store), stored as
  the contract level at the time the order was created.
- **Relations with a nation -> customer goodwill per country** (slice 8):
  shipped on time and in full raises it, late or short lowers it; OTIF % per
  country. There are no nation profiles, so OTIF shows on a per-country
  customers list instead.
- **Expedite cost -> cash**, the one resource the game has.
- **Integration with the idle economy.** The existing flow (backlog in
  milli-orders, pickers, staging, docks, trucks, pay) stays the truth for
  income and pacing (RULES 3-11) and is not rewritten. The WMS is a discrete,
  bounded layer beside it: a few dozen key-account orders at a time, each with
  lines, bins, pickers and statuses, that the player manages by hand. Slice 8
  is where its results reach the economy (pay and goodwill).

## Detected stack
- TypeScript monorepo, npm workspaces: `packages/contracts` (types only),
  `packages/sim` (pure deterministic sim), `packages/harness` (tests, bots,
  Node-vs-Chromium determinism), `apps/web` (Vite + React 19 PWA).
- Tests: Vitest (+ fast-check) at the root, `npm test`; `npm run check` runs
  ESLint and `tsc`. Purity of sim and contracts is enforced (T3).
- Styling: plain CSS in `apps/web/src/styles.css`; animation by direct DOM
  writes outside React (P7). No UI libraries.
- Persistence: IndexedDB saves of `{ snapshot, commandLog }` with schema
  migrations (`packages/sim/src/save.ts`, `apps/web/src/platform/saves.ts`).

## Where things live
- **Game state:** `WarehouseState` in `packages/contracts/src/warehouse.ts`;
  created in `packages/sim/src/state.ts` (`createWarehouse`, `openWarehouse`).
- **Tick loop:** `step(state, commands)` and `advanceMany(state, n)` in
  `packages/sim/src/step.ts` (`tickInPlace` runs one tick on a mutable copy).
  The host clock is in `apps/web/src/platform/engine.ts` / `localHost.ts`
  (Web Worker), 250 ms a tick (`tickMs`).
- **Commands** (the only way to change state): `WarehouseCommand` in
  contracts, validated in `packages/sim/src/commands.ts`, applied in `step.ts`.
- **View** (all the UI reads): `warehouseView(state)` in
  `packages/sim/src/view.ts`; the UI store is `apps/web/src/ui/store.ts`.
- **Tunables:** `packages/sim/src/tunables.ts`, mirrored in docs/RULES.md
  section 12 (a test keeps them identical).

## Data model (as built in packages/contracts/src/wms.ts)
All integers (P3); names and codes are formatted from indices by the sim's
WMS catalog, so State stays compact and hashable.

- `WmsState` (field `wms` of `WarehouseState`): `rng` (its own seeded stream,
  so the WMS never shifts the idle game's random draws), `nextOrderNo`,
  `nextWave`, `orders`, `inventory`, `pickers`, `events`.
- `WmsOrder`: `no` (shown `O-10234`), `dest` (index into `WMS_DESTINATIONS`),
  `source` (contract level of the customer), `priority` 1-3 (P1 Expedite, P2
  High, P3 Standard), `wave` (0 = not released), `status`, `lines`, `shipBy`
  (cutoff tick), `created` (tick). Line count, units ordered and picked and %
  complete are derived in the View, not stored.
- `WmsLine`: `no`, `sku` (index into `WMS_SKUS`, shown `GRN-0042`), `bin`
  (index, shown `A-03-2B`), `ordered`, `allocated`, `picked`, `short` (whole
  units), `status`.
- Order statuses: NEW, RELEASED, ALLOCATED, PICKING, PICKED, PACKED, STAGED,
  LOADED, SHIPPED; exceptions SHORT, ON HOLD, BACKORDER, CANCELLED.
- Line statuses: OPEN, ALLOCATED, PICKING, PICKED, SHORT.
- `WmsStock`: one SKU in one bin: `sku`, `bin`, `onHand`, `allocated`
  (available = onHand - allocated).
- `WmsPicker`: `id` (Picker 01..N), `order`/`line` it works (0 = idle),
  `progress` (milli-units picked on the current line).
- `WmsEvent`: `tick`, `code` (ORD CRT, WAVE REL, ALLOC, ALLOC SHORT, PICK
  START, PICK CONF, SHORT PICK, PACK, STAGE, LOAD, SHIP, HOLD, CUTOFF MISS),
  `order`, `line`, `qty`, `picker` (0 = none). The message text is built by
  the View; the last 200 are kept.

## Slices
1. **Data model + seeded generator.** Types, the `wms` state field (save
   schema 2, migration from 1), a generator that makes 10-15 realistic sample
   orders (there are no trade/aid/project commitments in this game), debug
   counts in the View and the settings sheet. Generator unit tests.
   STATUS: DONE. Types in `packages/contracts/src/wms.ts`; catalog
   (`WMS_SKUS`, `WMS_DESTINATIONS`, `orderCode`, `binCode`) in
   `packages/sim/src/wms/catalog.ts`; `createWms` in `wms/generate.ts`
   (called by `openWarehouse` and the 1-to-2 migration in `save.ts`);
   `wmsSummary` in `wms/view.ts` is `view.wms`. Slice 2: `step.ts` holds
   `wms` by reference in `MState` (never mutated yet) - copy it before
   changing it in place, and step it inside `tickInPlace`. Tunables `wms*`.
2. **Tick engine.** Status progression, picker assignment (FIFO by priority
   then ship-by), allocation, shorts, cutoff misses, activity events (last
   200), new orders arriving over time. Unit-test the transitions. Keep
   24 h catch-up inside the phone budget (`npm run harness -- bench`).
   STATUS: DONE. `wmsStep` in `packages/sim/src/wms/tick.ts`, called from
   `tickInPlace` every `wmsStepTicks` (4 ticks = 1 s); helpers `releaseWave`,
   `startPick`, `findOrder`, `log`, `cloneWms` are exported for the commands
   of slice 7. Orders gained `next`, `late`, `held`, `closed`; events gained
   `sku` and `of`; the WMS gained clocks, `stats`, `dests` (with `goodwill`)
   and `recent` (lines per 15 s bucket). Save schema 3. Rules: RULES 16.
   24 h catch-up 117 ms -> about 300 ms in Node (budget 2 s on a phone).
3. **Order grid screen.** Dense rows, sticky Order # column and header, status
   chips, progress bars, sort, filter chips, live rows without scroll jumps.
   STATUS: DONE. The sim builds `view.wms` (`WmsView`, `wmsView` in
   `packages/sim/src/wms/view.ts`: rows with lines, events newest first with
   text, KPIs, pickers, countries, `rev`). UI in `apps/web/src/ui/wms/`:
   `WmsScreen.tsx` (full-screen, opened by the WMS button in the bottom bar,
   `sheet === 'wms'` in App), `OrderGrid.tsx` (memoised rows keyed by
   `rowSignature`), `grid.ts` (filters, sort, tones, clock), `useWms.ts`
   (re-renders once per WMS step), `wms.css`. `e2e/wms-shots.ts` screenshots.
4. **Order detail.** Header summary, lines grid, shorts in red, the order's own
   history; back keeps scroll and filter. STATUS: DONE. `OrderDetail.tsx`:
   summary, lines (description under the SKU so Status fits 360 px), the
   order's events (`EventLines`, shared with the feed). `WmsScreen` keeps
   filter, sort and the grid's scroll (`GridScroll`) while detail is open.
5. **Activity feed.** Collapsible bottom console, newest first, tap to open the
   order, exceptions in red. STATUS: DONE. `ActivityFeed.tsx`, docked under
   the grid and the detail; collapsed it shows the latest event and the
   count of exceptions in the log; open, 52% of the screen.
6. **KPI strip.** Open orders, lines/hr, fill rate, OTIF, exceptions, pickers
   busy/total. STATUS: DONE. `KpiStrip.tsx` from `view.wms.kpis` (lines/hr
   over the last 4 minutes, `recent` buckets); fill under 95%, OTIF under
   90% and any exception show red. The header shows the next wave's
   countdown. Ship-by tightened to 3-8 min for P3 (idle: ~93% on time, ~80%
   OTIF) so priorities and expedites matter.
7. **Player actions.** Release a wave, change priority, hold/unhold, reassign a
   picker, cancel a line, expedite for cash; each logs an event. STATUS: DONE.
   A `wms` command (`WmsAction` in contracts; shape check in `commands.ts`)
   applied by `wmsAction` in `packages/sim/src/wms/actions.ts`; the step
   charges the expedite and emits a `wms` event or `rejected`. Orders gained
   `expedited` (save schema 4); lines can be CANCELLED. UI: `Actions.tsx`
   (priority, hold, expedite; per line, picker buttons and a two-tap cancel;
   the Release… mode with its bar). RULES 16 lists the rules.
8. **Feedback loop.** OTIF and shipping results into customer goodwill per
   country and pay; OTIF per country on screen; toasts for key ships and
   misses. STATUS: DONE. `ship()` in `tick.ts` pays `shipmentPay` and moves
   goodwill by `goodwillChange`; `wmsStep` returns the cents, which the step
   adds to cash and `earned`, and pushes `wmsShipped` and `wmsMissed`
   events. UI: a Countries page (`Countries.tsx`, tab in the WMS header:
   shipped, OTIF %, goodwill bar and pay factor), goodwill on the order
   detail, and App toasts when a P1 order ships or a P1/P2 order misses its
   cutoff. Pacing unchanged (first sale 36.2 min).
9. **Polish.** Tap targets, dark mode, reduced motion, empty states, 300
   orders / 2,000 lines scrolling smoothly (virtualise by hand if needed).
   STATUS: TODO
