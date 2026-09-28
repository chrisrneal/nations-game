# Gate 1 - Economy and trade: independent review (second pass)

Prompt 08 (re-run), 2026-09-28. Reviewed at `main` 733af1b, after prompts 09
(top-scorer rule change) and 10 (trade advantage, strict harness CLI) merged.
The first review (verdict FAIL, at 8aaf5e1) is in git history at b7cd5e8.

The reviewer did not build this code. Every result below was produced by
running it or reading it in this session. docs/PROGRESS.md, docs/balance/ and
the builders' comments were not taken as evidence. No code was changed.

## Verdict: **PASS WITH WAIVER** (owner, 2026-09-28, recorded after prompt 13)

The review's own verdict below was FAIL on criterion 5 only. After prompt 13's
trade-gain rule also failed it (graded 12.0 / 12.5 / 13.5 / 14.0%, reverted,
docs/balance/gate1-prompt13.md), the owner waived criterion 5 in writing and
marked Gate 1 passed so Phase 2 can start. Gate 2 re-grades the same number with
archetypes. See "Waivers" at the end of this file.

### Reviewer's verdict (prompt 08 re-run): FAIL

One criterion fails: **no nation may top the score in more than 2x its fair
share of games (11.8%)**. On the graded command (`--suite gate1 --games 200`,
seeds 1-200) Egypt tops 12.5% (25 of 200 games; the limit allows 23). Every
other fresh range fails too: Saudi Arabia 13.0% (201-400), Russia 15.0%
(401-600), Saudi Arabia 14.0% (601-800). Only the builders' tuning seeds pass
(1001-1200: Indonesia 11.0%). The prompt 09 rule is a large improvement (India
was 34.5-45%) but it is tuned to its own seeds and does not hold on fresh ones.

This is not bad luck. In a perfectly fair game each nation tops 5.9% of games;
over 200 games the most frequent winner lands near 9%, and reaching 24+ wins
happens in roughly 1-2% of runs. Four of four fresh ranges at 25-30 wins is a
real bias.

The owner could waive this in writing (option 2 in docs/balance/gate1-prompt09.md).
This review does not recommend it: the largest known cause is fixable in one
lane (the AI's choice of buyers, below), and Gate 2 will grade the same number
again with archetypes on top.

| # | Criterion (docs/ROADMAP.md) | Result |
|---|---|---|
| 1 | 200 seeded full-roster games: no crashes, no negative stocks, sources and sinks in band | PASS |
| 2 | Same nation does 15%+ better against its baseline trading than isolating (paired runs) | PASS (+17.6-17.7% on every fresh range) |
| 3 | Isolationists worse off but alive | PASS |
| 4 | Dead states under 2% | PASS |
| 5 | No nation tops the score in more than 2x its fair share (11.8%) | **FAIL** (12.5-15.0% on every graded range) |
| 6 | A trade in 3 taps or fewer | PASS (2 taps, headless phone); OWNER CHECK on a real phone |
| 7 | Gate 0 still passes | PASS on everything automated; OWNER CHECK: phone speed |

## What was run

| Command | Result |
|---|---|
| `npm ci` | clean install |
| `npm test` | 21 files, 295 tests passed, 0 skipped (Chromium present) |
| `npm run check` | lint + typecheck of every workspace, exit 0 |
| `npm run harness -- --suite gate1 --games 200` | Runs the Gate 1 suite now (first review's F1 fixed). Seeds 1-200: **FAIL**, exit 1. Only failing line: top scorer Egypt 12.5% |
| `npm run harness -- gate1 --games 200 --seed 201` | FAIL: Saudi Arabia 13.0%; trade gain +17.6% |
| `npm run harness -- gate1 --games 200 --seed 401` | FAIL: Russia 15.0%; trade gain +17.6% |
| `npm run harness -- gate1 --games 200 --seed 601` | FAIL: Saudi Arabia 14.0%; trade gain +17.7% |
| `npm run harness -- gate1 --games 200 --seed 1001` (builders' tuning seeds) | PASS: Indonesia 11.0%; trade gain +18.0% |
| `npm run harness -- determinism` | 1,000/1,000 identical, Node repeat and Node vs HeadlessChrome 141: PASS |
| `npm run harness -- bench` | 1,000 ticks, 23 nations, greedy AI: median 420 ms Node, 376 ms Chromium on the build machine |
| `npm run build` then `npm run e2e --workspace web` | 33/33 phone checks at 360 px, including "a trade offer in 3 taps or fewer (2 taps)" |
| Scratch script (deleted after use): seeds 1-200, winner by the end screen's formula vs the sim's scoreboard | **They disagree in 93 of 200 games** (finding N1) |

## Criterion by criterion

### 1. 200 games, no crashes, no negative stocks, sources and sinks in band: PASS
- Seeds 1-200: 200 games of 60 ticks with the real 17 nations and 6 regions,
  random strategy per nation, plus 400 paired games. 0 crashes, 0 rejected
  commands. Same on seeds 201-800.
- Negative stocks: 0. The suite checks every stock of every nation after every
  tick (`onTick` in packages/harness/src/game.ts, `negativeStocks` in gate1.ts).
  The conservation property test in packages/sim/src/economy.test.ts passes.
- Sources and sinks: food consumed/produced 91.8-92.1%, energy 84.5-84.8%
  (band 75-100%), Credit sinks 0.5% of income (band 0-25%) on every range.
- Caveat from the first review stands: the Credit band's lower edge of 0%
  cannot fail. Phase 2 crises should give it a real floor.

### 2. Trading beats isolating by 15%+: PASS
- Metric definition unchanged since the first review (read in gate1.ts: median
  of trading ownScore / isolating ownScore - 1, one random nation per seed, all
  else equal). `gainsFromTradeBp` is still 40; the gain rose because prompt 09
  changed how trade gains and the baseline are computed.
- Seeds 1-200 +17.7%, 201-400 +17.6%, 401-600 +17.6%, 601-800 +17.7%, 1001-1200
  +18.0%. Robust now: 2.6 points clear on every range, where the first review
  found 14.0-15.7%.
- Uneven by nation (seeds 1-200): Japan +5.2%, Korea +4.5%, Turkiye +4.6%,
  South Africa +13.9%, Mexico +14.1%; Australia +15.1% and Canada +15.7% sit on
  the line. The criterion is the median, so this passes, but a player who picks
  Japan, Korea or Turkiye learns that trade barely helps (already in GAPS,
  prompts 09 and 10).

### 3. Isolationists worse off but alive: PASS
Isolating scores lower than trading in 94.5-96.0% of pairs on every range.
0 isolating runs end dead. Isolationist mean ownScore 0.956 vs trader 1.129.

### 4. Dead states under 2%: PASS
0.0% on every range. As the first review noted, the 30% monthly penalty cap
makes this easy to meet; look harder once crises exist.

### 5. No nation tops the score in more than 2x fair share: FAIL
| Seeds | Top nation | Share (wins) | Result |
|---|---|---|---|
| 1-200 (graded command) | Egypt | 12.5% (25) | FAIL |
| 201-400 | Saudi Arabia | 13.0% (26) | FAIL |
| 401-600 | Russia | 15.0% (30) | FAIL |
| 601-800 | Saudi Arabia | 14.0% (28) | FAIL |
| 1001-1200 (tuning seeds) | Indonesia | 11.0% (22) | pass |

Limit: 2/17 = 11.8%, i.e. at most 23 wins in 200. Seeds 1-200 full table:
Egypt 12.5, Russia 12.0, Saudi Arabia 11.0, Brazil 10.0, Nigeria 7.5 ... China
1.0, India 1.0. Every nation now wins sometimes, which is real progress.

What was checked in the code:
- The metric is unchanged: the top nation by `finalScore` from the sim's
  `scoreboard` (gate1.ts). No threshold moved.
- The prompt 09 tunables (`structuralCoverSharePct` 80, `shortfallPenaltyBpPerPct`
  35, `scoreSmoothingTicks` 12) live in tunables.ts inside their bands and say
  they were tuned on seeds 1001-1400. Nothing here can prove that, but the
  pattern (tuning seeds pass, every other range fails) fits it, and fits a rule
  that is fitted to its seeds rather than fair in general.
- Largest remaining driver, confirmed in code: the greedy AI ranks buyers by
  raw deficit size with at most `aiNoiseBp` jitter
  (packages/ai/src/greedy.ts, the `buyers` sort in "2. Sell"), so the same
  importers get the scarce energy game after game. That lives in lane A and no
  sim rule can undo it.

### 6. A trade in 3 taps or fewer: PASS (OWNER CHECK on a real phone)
- e2e at 360 px: "Offer sent" after 2 taps (card → option); the first option's
  centre at 505 of 740 px (bottom third); AI offers arrive as 3 cards; a
  counter-offer is sent from the trade sheet.
- Weakness in the evidence still open (first review F3): "accepting an offer
  settles it in the sim" (apps/web/e2e/phone-check.ts:108) passes on "failed"
  or "Not sent" as well as "Trade done". Settlement itself is covered by sim tests.
- The owner has not sent or accepted a trade on a real phone. docs/playtests/
  is empty.

### 7. Gate 0 still passes: PASS on everything automated; OWNER CHECK on phone speed
| Gate 0 criterion | Now |
|---|---|
| Sim core has no UI, DOM, network or clock imports | PASS. purity.test.ts passes; the only non-relative import in sim and contracts sources is `@nations/contracts` (plus vitest and fast-check in tests); `Math.random`, `Date`, `document`, `window` appear only in comments |
| 1,000 seeds identical in browser and Node | PASS (1,000/1,000, real roster, greedy AI) |
| Dummy AI and UI use the same command API | PASS. engine.ts submits `greedyDecide(viewFor(state, id))` Commands to the same session the UI's `Host.submit` reaches |
| Save-reload-continue matches an uninterrupted run | PASS. session.test.ts property test; schema 3 migration tested; e2e export → wipe → import gives the same fingerprint and continues |
| 1,000 catch-up ticks under 2 s on a mid-range phone | **OWNER CHECK.** 420 ms Node / 376 ms Chromium on the build machine. A phone 4-5x slower is near the limit; no reading from a phone with the economy yet |
| PWA installs and runs offline | PASS in headless Chromium (installable, opens offline, continues offline) |
| Owner completes three decisions one-handed | Owner reported for Phase 0; repeat in Gate 2 playtests |
| Nine seams | PASS (seam 8 reviewed in the first Gate 1 review; unchanged since) |

## Architecture rules (CLAUDE.md): hold
- **Pure sim and contracts:** hold (above). New prompt 09 code (`structuralCover`,
  `baselineOutputFor`, `nextScoreTrack`) is integer maths from State and tunables.
- **Commands only / View only:** hold. AI reads `viewFor(state, id)` only;
  boundary.test.ts keeps the UI off the sim and AI.
- **Controller slots, interactions with expiry, Host only:** unchanged, hold.
- **Tunables:** every new number (`structuralCoverSharePct`,
  `scoreSmoothingTicks`, retuned `shortfallPenaltyBpPerPct`) is in tunables.ts
  with a band and a note. No new inline game numbers found.
- **Watch item, now a real bug (N1):** the interface computes scores itself
  instead of reading the sim's. See below.

## Mobile depth budget (trade screens): meets it
| Rule | Evidence | Result |
|---|---|---|
| Any decision within 3 taps of home | 2 taps to offer, accept, decline, withdraw; 3 to counter | PASS |
| No horizontal scroll | e2e at 360 px on inbox, decision sheet, counter-offer sheet, trade sheet, map, game tab, game over | PASS |
| Tables max 4 columns | Only table: game over (#, Nation, Baseline, Score) | PASS |
| 3-5 resources in one strip | 4: food, energy, credit, resilience | PASS |
| Every number actionable or explanatory | Trade screens: yes (chips, prices, output line open why-sheets). Outside the trade screens, the output line and end screen now show a number the sim does not score by (N1) | PASS for trade screens; N1 elsewhere |
| Primary actions in the bottom third | First option at 505/740 px. Trade sheet's Send button still not measured | PASS, thin margin |
| Cut list | No trade ledger; trades are one step | PASS |

## Other findings (not gate criteria)
- **N1 - The end screen can name the wrong winner.** Since prompt 09 the sim
  scores a 12-month average (`WorldState.scoreTrack`), which the View does not
  carry. `standings()` in apps/web/src/ui/econ.ts and the "% of baseline" line
  in ResourceStrip.tsx still use last month's output / baseline. Replaying seeds
  1-200 with the gate1 strategies, the nation that formula ranks first differs
  from the sim's winner in **93 of 200 games**. The player could be told they
  won when they did not. The why-sheet also still says the baseline is "the path
  the IMF projects for you", which is no longer true (RULES 2.8). Logged by the
  builders in GAPS (prompt 09); should be fixed before any playtest. Lanes C, S, U.
- **N2 - Vacuous e2e trade check** (first review F3) still open. Lane P.
- **N3 - Trader archetype tops 2.84x fair share** on seeds 1-200 (hoarder
  0.42x, isolationist 0.04x, exploiter 0.70x). Gate 2 allows 1.5x. Expect it to
  fail there.
- **N4 - No playtest records.** docs/playtests/ is empty. Not a Gate 1
  requirement; Gate 2 needs 10.
- First review's F1 (harness ignored `--suite`) is **fixed**: the CLI accepts
  `--suite gate1` and rejects unknown flags (args.ts, args.test.ts).

## To pass on re-review
1. The most frequent top scorer at 11.8% or less on seeds 1-200 **and** on
   seeds 201-400, 401-600 and 601-800, thresholds unchanged, tuned only on
   seeds 1001 and above. Criterion 2 must stay at +15% or more on the same
   ranges. Or: a written owner waiver of criterion 5 in this file.
2. Owner: the phone speed check with the Phase 1 economy, and one real trade
   sent and accepted on the phone.
3. Recommended before playtests (not a gate criterion): fix N1.

## Waivers (owner, 2026-09-28)

| # | Criterion | Status after waiver |
|---|---|---|
| 5 | No nation tops the score in more than 2x its fair share (11.8%) | **WAIVED.** On main the most frequent top scorer is 12.5-15.0% on seeds 1-800, down from India's 34.5-45% before prompt 09. Prompts 09, 11 and 13 each tried a fix; none held on fresh seeds. Carried to Gate 2, which grades it again ("no archetype over 1.5x fair share", and this criterion through "Gates 0-1 pass") |
| 6 | A trade in 3 taps or fewer | PASS (2 taps, headless phone at 360 px). The owner's real-phone trade is not yet reported; carried to the Gate 2 playtests |
| 7 | Gate 0 still passes | PASS on everything automated. The owner's phone speed check with the Phase 1 economy is not yet reported; carried to the Gate 2 playtests |

The owner marked the gate passed without the two phone checks; both belong
in the first Gate 2 playtest. What is known about the waived criterion, and
what to try if Gate 2 fails it, is in docs/balance/gate1-prompt13.md
(sections 4-5) and docs/GAPS.md (prompt 13).
