# Gate 1 - Economy and trade: independent review

Prompt 08, 2026-09-28. Reviewed at `main` 8aaf5e1 (after prompt 07 merged).
The reviewer did not build this code. Every result below was produced by running
it or reading it in this session. docs/PROGRESS.md, docs/balance/ and the
builders' comments were not taken as evidence. No code was changed.

## Verdict: **FAIL**

Two criteria fail:

1. **Top scorer.** India tops the score in 34.5-45% of games against a limit of
   11.8%, on every seed range tried. Known since prompt 06. Nothing has changed.
2. **Trading vs isolating.** The +15% trade advantage passes on the official
   seeds 1-200 by 0.4 points (+15.4%), and only after `gainsFromTradeBp` was tuned
   to the top of its band against those same seeds. On fresh seeds it fails: 401-600
   gives +14.0%, 601-800 gives +14.9%, and all 800 pairs pooled give **+14.5%**.
   For 7 of the 17 nations trading is worth less than 15%: Australia +4.0%,
   Canada +4.9%, Brazil +6.6%, Korea +8.6%, South Africa +11.2%, Japan +11.6%,
   Turkiye +11.9%.

Everything else held up. That covers the economy invariants, isolationists,
dead states, the trade taps, the architecture rules, the depth budget and
Gate 0's automated checks. Two items wait on the owner's phone (see OWNER CHECK).

| # | Criterion (docs/ROADMAP.md) | Result |
|---|---|---|
| 1 | 200 seeded full-roster games: no crashes, no negative stocks, sources and sinks in band | PASS |
| 2 | Same nation does 15%+ better against its baseline trading than isolating (paired runs) | **FAIL** (not robust: 14.5% pooled) |
| 3 | Isolationists worse off but alive | PASS |
| 4 | Dead states under 2% | PASS |
| 5 | No nation tops the score in more than 2x its fair share (11.8%) | **FAIL** (India 34.5-45%) |
| 6 | A trade in 3 taps or fewer | PASS (2 taps); OWNER CHECK on a real phone |
| 7 | Gate 0 still passes | PASS on everything automated; OWNER CHECK: phone speed |

## What was run

| Command | Result |
|---|---|
| `npm ci` | clean install, 0 vulnerabilities |
| `npm test` | 19 files, 257 tests passed, 0 skipped (Chromium present) |
| `npm run check` | lint + typecheck of every workspace, exit 0 |
| `npm run harness -- --suite gate1 --games 200` | **Does not run the Gate 1 suite.** The CLI ignores `--suite` and runs the default `play` command (200 games x 200 ticks, 0 rejected, exit 0). See finding F1 |
| `npm run harness -- gate1 --games 200` (seeds 1-200) | FAIL: every metric passes except the top scorer (India 45.0%); trade gain +15.4%; exit 1 |
| `npm run harness -- gate1 --games 200 --seed 201` | FAIL: India 42.0%; trade gain +15.7% |
| `npm run harness -- gate1 --games 200 --seed 401` | FAIL: India 34.5%; trade gain **+14.0%** |
| `npm run harness -- gate1 --games 200 --seed 601` | FAIL: India 39.0%; trade gain **+14.9%** |
| Scratch script (deleted after use) pooling the 800 paired runs above via `runGate1` | median +14.5%; 48.9% of pairs at +15% or more |
| `npm run harness -- determinism` | 1,000/1,000 identical twice in Node and in Node vs HeadlessChrome 141: PASS |
| `npm run harness -- bench` | 1,000 ticks, 23 nations, greedy AI: median 515 ms in Node, 432 ms in Chromium on the build machine |
| `npm run build` then `npm run e2e --workspace web` | 33/33 phone checks at 360 px, including "a trade offer in 3 taps or fewer (2 taps)" |

## Criterion by criterion

### 1. 200 games, no crashes, no negative stocks, sources and sinks in band: PASS
- 200 games of 60 ticks with the real 17 nations and 6 regions, each nation
  given a random strategy, plus 400 paired games: 0 crashes, 0 rejected commands.
- Negative stocks: 0. The suite checks every stock of every nation after every
  tick (`onTick` in packages/harness/src/game.ts:86, `negativeStocks` in
  gate1.ts). The property test in packages/sim/src/economy.test.ts also passes.
  It checks conservation to the unit, no negative stocks and that offers always
  expire.
- Sources and sinks: world food consumed/produced 92.2%, energy 84.8% (band
  75-100%), Credit sinks 0.5% of income (band 0-25%). Seeds 201-800 give the same
  figures to within a point.
- Caveat: RULES.md never defined these bands. They first appear in gate1.ts, in
  the same commit that produced the results. The comment in gate1.ts says they
  were fixed before any result was seen, and nothing here can prove that. The
  Credit band's lower edge of 0% cannot fail. Resilience is Phase 1's only
  Credit sink, and it barely runs. Accepted for Phase 1; Phase 2 crises should
  set a real lower bound.

### 2. Trading beats isolating by 15%+: FAIL
- The suite picks one nation per seed. That nation plays the greedy trader in
  one game and the isolationist in the other, and nothing else changes. The
  metric is the median of trading ownScore / isolating ownScore - 1.
- Seeds 1-200: +15.4% (pass line 15%). The prompt 06 log records that
  `gainsFromTradeBp` went from 15 to 40, the top of its RULES band, to move this
  exact number from +5.4% to +15.4% on these seeds. So the pass comes from tuning
  against the seeds that grade it.
- Independent seeds: 201-400 +15.7%, 401-600 +14.0%, 601-800 +14.9%. Pooled over
  800 pairs: **+14.5%**. Fewer than half the pairs (48.9%) clear 15%.
- Per nation, pooled: raw exporters and self-sufficient nations barely gain from
  trade (Australia +4.0%, Canada +4.9%, Brazil +6.6%, Korea +8.6%). Importers gain
  a lot (India +106%, Indonesia +54%, Germany +44%). The effect is real but
  unevenly spread, and the median sits on the line.
- RULES.md still gives `gainsFromTradeBp` a starting value of 15. The code uses
  40, so the design document and the game disagree.

### 3. Isolationists worse off but alive: PASS
Isolating scores lower than trading in 94-96% of pairs on every seed range.
0 isolating runs end dead. The isolationist archetype's mean ownScore is 0.83-0.84
against the trader's 1.04-1.05.

### 4. Dead states under 2%: PASS
0.0% on all 800 seeds. "Dead" is ownScore < 0.50 at game end. The shortfall
penalty is capped at 30% a month (`maxShortfallPenaltyPct`), so an economy
cannot collapse inside one 60-month game. That makes the 2% limit easy to meet.
It should get a harder look once crises exist.

### 5. No nation tops the score in more than 2x fair share: FAIL
| Seeds | Top nation | Share | Next |
|---|---|---|---|
| 1-200 | India | 45.0% | Russia 24.0%, Indonesia 13.0% |
| 201-400 | India | 42.0% | Russia 23.5%, Indonesia 19.0% |
| 401-600 | India | 34.5% | Russia 29.5%, Indonesia 16.0% |
| 601-800 | India | 39.0% | Russia 29.5%, Indonesia 15.0% |

The limit is 2/17 = 11.8%. Three nations exceed it on every range. Six nations
(China, Egypt, Germany, Japan, Mexico, Turkiye) topped 0 of 200 games on seeds
1-200. The cause diagnosed in prompt 06 still holds: the world data is short of
energy and food, so importers always pay some shortfall penalty. The trade bonus
is also scaled by the deficit it covers, so nations with the biggest deficits
gain most from trade (India +106%). Tuning within the bands cannot fix this. It
needs a rule change.

### 6. A trade in 3 taps or fewer: PASS (OWNER CHECK on a real phone)
- Read in code: apps/web/src/ui/cards.ts builds shortfall and spare-goods cards
  with a one-tap "Buy ... / Offer ..." option that sends a real `offer` Command.
  Incoming offers have one-tap Accept. Inbox.tsx opens a card in one tap, and the
  options sit in a bottom sheet. From home that is 2 taps to send an offer and 2
  taps to accept one.
- Run: the e2e phone check drove headless Chromium at 360 px. "Offer sent" came
  after 2 taps, and the first option's centre was at 511 of 740 px (bottom third).
- Weakness in the evidence: the e2e check "accepting an offer settles it in the
  sim" passes whenever the toast says "Trade done", "failed" or "Not sent", so it
  passes even if the trade fails (finding F3). Settlement itself is covered by
  sim tests.
- The owner has not yet sent or accepted a trade on a real phone.
  docs/playtests/ is empty.

### 7. Gate 0 still passes: PASS on everything automated; OWNER CHECK on phone speed
| Gate 0 criterion | Now |
|---|---|
| Sim core has no UI, DOM, network or clock imports | PASS. purity.test.ts (82 checks) passes; grep finds no `Math.random`, `Date`, `document` or `window` in sim, contracts or ai sources |
| 1,000 seeds identical in browser and Node | PASS. Re-run with the real roster and the greedy AI: 1,000/1,000 |
| Dummy AI and UI use the same command API | PASS. The UI submits Commands through `Host.submit` (App.tsx `send`). The platform runs `greedyDecide(viewFor(...))` and submits its Commands to the same session (engine.ts:189-193). boundary.test.ts stops the UI importing the sim or the AI |
| Save-reload-continue matches an uninterrupted run | PASS. The property test in session.test.ts now includes the economy. e2e export → wipe → import restores the same fingerprint and continues |
| 1,000 catch-up ticks under 2 s on a mid-range phone | **OWNER CHECK.** 515 ms Node / 432 ms Chromium on the build machine, up from ~15 ms in Phase 0. A phone 4x slower would be at the limit. The owner's earlier reading predates the economy |
| PWA installs and runs offline | PASS in headless Chromium (installable, opens offline). The owner's real-device report predates prompt 07; re-checking is advised but not required |
| Owner completes three decisions one-handed | Owner reported for Phase 0. The cards are new, so it should be repeated in the Gate 2 playtests |
| Nine seams (waived at Gate 0 because seam 8 was missing) | **Seam 8 now reviewed: PASS.** Trade offers are State objects with `expiryTick` (contracts/trade.ts). Standing policies answer on the last tick for absent nations (sim/trade.ts `policyAnswer`, lines 184-222). Unanswered offers expire with a trust cost. The View carries only offers involving the viewer (view.ts). The 19 trade tests cover every path, including "with no commands at all, every offer is resolved within its life" |

## Architecture rules (CLAUDE.md): hold
- **Pure sim and contracts:** hold (see Gate 0 row 1). Sim randomness is the
  seeded RNG. Economy maths is integer basis points and milli-units. The greedy
  AI's noise is a hash, not `Math.random`.
- **Commands only:** hold. The UI keeps no game state. Cards are rebuilt from
  the View on every update, and an offer card exists only while the offer is
  open in State.
- **View only:** holds. `viewFor` builds foreign nations field by field and
  never exposes their stocks, trust or policy. The AI gets only `viewFor(state, id)`.
  Two items travel beside the View in `GameUpdate.standing`: the collective
  multiplier and a state-hash fingerprint. Both are public-by-nature and already
  logged (GAPS, prompt 07).
- **Controller slots:** `human | ai | caretaker` in contracts, switchable by
  command, tested.
- **Interactions with expiry:** hold (seam 8 above).
- **Tunables:** no inline game numbers found in sim economy, trade, trust or
  score sources. The only literals are unit conversions (/12, /100) and the
  50-point defaults for a roster entry with no endowment (world.ts:62-67). Those
  apply only to hand-made test rosters.
- **UI only through the Host:** holds (boundary.test.ts, 19 checks).
- Watch item: `standings()` in apps/web/src/ui/econ.ts:167 recomputes every
  nation's final score in the interface from View fields. It copies the sim's
  scoring formula rather than reading the sim's scoreboard, so the end screen
  could drift from the real score if scoring changes.

## Mobile depth budget (trade screens): meets it
| Rule | Evidence | Result |
|---|---|---|
| Any decision within 3 taps of home | 2 taps (card → option) for offer, accept, decline, withdraw; 3 for adjust/counter (card → "Adjust…" → Send) | PASS |
| No horizontal scroll | e2e: 360 px on the inbox, decision sheet, counter-offer sheet, trade sheet, map, game tab and game over | PASS |
| Tables max 4 columns | The only table is the game-over table: #, Nation, Baseline, Score | PASS |
| 3-5 resources in one strip | 4: food, energy, credit, resilience | PASS |
| Every number actionable or explanatory | Resource chips, price line, output line and multiplier open why-sheets. The game-over table's Baseline % and Score cells do not | Minor gap |
| Primary actions in the bottom third | First card option at 511/740 px, just inside. The trade sheet's Send button is not measured by the e2e check | PASS, thin margin |
| Cut list (no ledgers, no deep chains) | No trade history ledger. Trades are one step (goods ↔ goods or credit) | PASS |

## Other findings (not gate criteria)
- **F1 - Harness ignores unknown flags.** `npm run harness -- --suite gate1`
  silently runs the default `play` command and exits 0, so it looks like a
  passing Gate 1 run. The real command is `npm run harness -- gate1`. The CLI
  should reject unknown flags or accept `--suite`. Lane H.
- **F2 - The trader archetype wins 2.3-2.6x its fair share** (exploiter
  1.3-1.7x, hoarder and isolationist ~0x). This is not a Gate 1 criterion, but
  Gate 2 caps any archetype at 1.5x. Expect it to fail there unless the top
  scorer fix also flattens it.
- **F3 - Vacuous e2e check.** "accepting an offer settles it in the sim"
  (apps/web/e2e/phone-check.ts:106-107) passes on "failed" or "Not sent" as well
  as "Trade done". Lane P.
- **F4 - AI offers are concentrated** on the biggest importers (already in GAPS,
  prompt 07). The e2e phone check plays only India, the nation that gets the
  most offers, so a quiet inbox for Japan or Korea is never exercised.
- **F5 - No playtest records.** docs/playtests/ is empty. Gate 1 does not
  require playtests, but Gate 2 needs 10.

## To pass on re-review
1. A rule change that brings every nation's top-score share to 11.8% or less
   over 200 seeds, with thresholds unchanged (fix prompt 09).
2. After that change, the paired trading gain at +15% or more on seeds 1-200 and
   on at least two fresh 200-seed ranges, tuned only on seeds outside the graded
   range (fix prompt 10).
3. Owner: the phone speed check with the Phase 1 economy (Game tab speed check,
   or open the app and run a 60-month game at 4x), and one real trade sent and
   accepted on the phone.
