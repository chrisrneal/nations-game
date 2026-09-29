# AI nations: design

How the AI nations think, remember and explain themselves (prompt 10). Code:
`packages/ai/src`. Rules it implements: docs/RULES.md sections 3, 4 and 7.
Decisions it obeys: D5 (deterministic utility AI, no LLM), D9 (personality
from data, never stereotypes), seams 2, 6, 7 and 8.

In one paragraph: every AI nation reads only what a human player of that
nation would see, keeps a memory of who kept and broke deals and who paid
into crisis pools, has a personality computed from its row in
data/world-2030.json, re-scores what it wants every few months, scores
templated moves against those wants, negotiates prices that move with trust,
and says why - in a short sentence with a number in it - for every decision
another player can see.

---

## 1. The seven layers

| # | Layer | File | Runs |
|---|---|---|---|
| 1 | Perception | `perception.ts` | every tick |
| 2 | Beliefs and memory | `beliefs.ts` | memory every tick; beliefs on think ticks |
| 3 | Personality | `personality.ts` | once per game (fixed by data) |
| 4 | Goals | `goals.ts` | think ticks (staggered) |
| 5 | Action scoring | `actions.ts` | every tick, inside the budget |
| 6 | Negotiation | `negotiation.ts`, `pledge.ts` | every tick, never deferred |
| 7 | Explanation | `explain.ts` | with every decision |

`mind.ts` wires the layers for one nation (`NationMind`); `director.ts` runs
the whole roster inside the per-tick budget (`AiDirector`).

### 1.1 Perception: own View only
A mind is given its nation's `NationView` and the events of the last tick.
`visibleTo(event, self)` drops every event whose audience does not include the
nation (an empty audience is public). There is no other door, so the AI can
never know a secret deal between two other nations, another nation's stocks,
or another nation's trust. A test feeds a private event between two nations to
a third mind and checks it learns nothing.

The events that matter, and what they mean to the mind:

| Event | Observation |
|---|---|
| `offerSettled` | the partner kept a deal |
| `offerFailed` (partner is the reneger) | the partner **broke a deal** |
| `offerExpired` (my offer) | the partner ignored me |
| `offerRejected` (my offer) | the partner declined me |
| `crisisClosed` (proposed, section 6) | each nation **paid** or **skipped** the pledge |

### 1.2 Beliefs and memory
**Memory** (`PartnerMemory`, per partner, integers only): deals kept and broken,
offers ignored and rejected, pledges paid and skipped, a grievance that fades
`aiMemoryDecayPct` a tick, the number of offences still in memory, the last
offence (what, when), and any retaliation in force (`punishFrom`,
`punishUntil`). Memory is saved with the game (section 4).

**Beliefs** (`PartnerBelief`, rebuilt on think ticks from the View): each
partner's structural need and surplus of food and energy, its strength (output
relative to ours), its score against its own baseline, and our trust in it. Trust
is the sim's own trust ledger (RULES 3.5, 6), so the AI and the sim never disagree
about it; the AI's own memory adds the *why* (which deal, which crisis) that
trust alone cannot carry. Threat is Phase 4 and is not modelled yet.

### 1.3 Personality
RULES 7.1-7.2, computed in integers from the nation's data row:
cooperativeness, risk, time horizon and reciprocity style (strict, forgiving,
exploiter). The RULES 7.3 worked examples are reproduced exactly (Japan 73 /
forgiving, Nigeria 47 / exploiter, Australia 41 / strict). On the 2030 roster:
strict 5 (United States, Saudi Arabia, South Africa, India, Australia),
forgiving 7, exploiter 5. `stanceLabel` turns `exploiter` into "hard bargainer"
for anything a player sees (RULES 12 Q4).

### 1.4 Goals
Re-scored every `aiGoalRescoreTicks` (3), staggered: nation *i* thinks on ticks
where `tick % 3 == i % 3`. Goals and their weights (0-10,000):

| Goal | Weight grows with |
|---|---|
| `cover:food`, `cover:energy` | share of demand uncovered x (50 + import dependence) |
| `sell:food`, `sell:energy` | share of production spare x (50 + cooperativeness) |
| `pledge` | a crisis is open: (exposure + time horizon) |
| `resilience` | resilience near the policy floor x (50 + time horizon) |

Goal order decides which good the nation sells or buys first. On its first move
the nation also sets its standing policies from its personality: resilience
floor `defaultResilienceFloor + (timeHorizon - 50) / 2`, cover priority = its
larger deficit, hard bargains on for exploiters.

### 1.5 Action scoring
Templated moves: *sell spare X to a partner short of X* and *buy missing X
from a partner with spare X*. Each candidate partner is scored

```
score = amount x (10,000 + noise + trustTilt - grievanceCut) / 100
noise        = seeded jitter in [0, aiNoiseBp]           (legible, not farmable)
trustTilt    = (trust - baseTrust) x cooperativeness / 2  (0 for exploiters)
grievanceCut = 100 x grievance points, up to 9,000
```

Partners under retaliation are skipped. Up to three buyers per good, within the
open-offer cap and the per-tick command cap. Prices are the reference price,
plus `aiExploiterMarkupPct` for exploiters, plus a grievance surcharge for an
exploiter's offenders; a swap is offered instead of Credit when the partner has
spare of what we lack.

### 1.6 Negotiation: accept, counter, reject
For an offer made to the nation, it compares what it receives with what it pays,
at reference prices (`ratio`, 10,000 = even), against its reservation:

```
reservation = 10,000
            - (trust - baseTrust) x aiTrustPriceBpPerPoint    (trusted partners get better terms)
            - cooperativeness x 10                            (cooperative nations round in your favour)
            - importDependence x 20, if the deficit bites now (urgency)
            + (aiExploiterMarkupPct + grievance surcharge) x 100, for exploiters
```

- partner under retaliation: **reject**, naming the broken deal or skipped pledge
  and the month trade resumes;
- nothing needed: **reject** ("no need for 920 energy: my energy need this month is 0");
- `ratio >= reservation` and payable: **accept**;
- within `aiCounterRangePct` below the reservation: **counter** at the reservation;
- otherwise **reject** with the gap in percent.

### 1.7 Reciprocity
| Style | After a broken deal | After a skipped pledge it paid into |
|---|---|---|
| strict | retaliates at once: `aiPunishTicks` (6) months of refused trade, open offers withdrawn, announced to the offender | half as long |
| forgiving | lets `aiForgiveLimit` (1) offences in memory pass and says so; then as strict | same |
| exploiter | never refuses; remembers, and charges the grievance as a surcharge | nothing |

Repeat offences inside memory escalate: a second doubles the retaliation, a third
or later triples it. When a retaliation ends the nation says so and trades again
(tit for tat, not a permanent grudge). Retaliation is decided in the reactive
part of the tick, which the budget never defers, so it always lands inside
`aiRetaliationWindowTicks` (2) of the offence.

### 1.8 Crisis pledges
`pledge.ts`. Fair share = what the pool still lacks, split by exposure x output
across the playable nations (both public). Then by style: forgiving pays
(50 + cooperativeness)% of it whatever others do; strict pays all of it when at
least `aiConditionalPledgePct` (50%) of nations paid into the last crisis, and
only that proportion otherwise (a conditional cooperator); an exploiter skips
once the pool is `aiFreeRideCoverPct` (70%) funded and pays a token share
before. Never more than `aiPledgeMaxIncomePct` of a month's income. Decided once
per crisis, the first tick it is seen; public, like the crisis card.

### 1.9 Explanation
Every command an AI sends comes with exactly one `aiExplained` event, and
retaliation, forgiveness, resumption and skipped pledges are announced too. The
event is a contracts `Event` with an audience: the two parties for anything
about a trade, everyone for pledges, the nation itself for its own policies. A
host delivers each one to its audience like any sim event. Examples from real
games:

- `declined: you broke the deal in month 1 (95 energy for 9 credit); no trade with you until month 9`
- `suspended trade with you until month 10: you skipped the flood relief in month 3`
- `forgave the deal in month 1 (95 energy for 9 credit): 1 of 1 allowed; the next one counts`
- `resumed trade with you in month 9 after you broke the deal in month 1 (95 energy for 9 credit)`
- `countered: for 3 credit I give 28 food, not 31 (your terms are 8% under my price)`
- `accepted: 410 energy covers my energy need of 618 at 103% of reference value`
- `offered 404 food for 46 credit: your food deficit is 404`
- `pledged 100 credit to the flood relief (month 3): first crisis: I pay my full share`
- `no pledge to the flood relief (month 3): the pool is 75% funded and pays out by exposure`

Each text is one short sentence starting with the verb, built from numbers only
(RULES 7.4), at most 140 characters, with up to three ranked reasons behind it
for a why-sheet.

---

## 2. Budget and staggering

Each tick the director, for every nation with a mind:

1. **perceives** (always; human nations too, so a caretaker takes over with a
   current memory);
2. **reacts** for `ai` and `caretaker` nations (always, never deferred):
   announcements, offer answers, pledges;
3. **thinks** if due (staggered by `aiGoalRescoreTicks`) and the tick's budget
   has room; a nation that does not fit waits, first in line, for the next tick;
4. **trades** (new offers) while the tick's budget has room.

Work is counted in units (one candidate scored = 1; a think costs 4 per known
nation), not milliseconds, so the budget is deterministic and identical on every
machine. The starting nation rotates each tick.

**The budget, `aiBudgetUnitsPerTick` = 4,000,** is sized as one 60 fps frame on a
mid-range phone. Measured (headless Chromium with 4x CPU throttling, the usual
stand-in for a mid-range phone; 17 nations + 6 regions):

| | Phase 1 greedy trader | This AI |
|---|---|---|
| AI time per month, mean | 2.0 ms | 3.1 ms |
| AI time per month, worst | 7.2 ms | 8.1 ms |
| Work per month (all 17 nations AI) | - | mean 779 units, peak 1,732 in month 1 when every nation thinks once (of 4,000) |
| A whole 60-month game, AI only | 0.12 s | 0.18 s |
| 1,000-month catch-up, sim + AI | 3.5 s | 4.5 s |

About 4 microseconds per unit at 4x throttle (3.1 ms for 779 units), so the
4,000-unit cap is about 16 ms: one frame. The full roster uses a fifth of it in
an average month and under half in its busiest month, and no think was ever
deferred in the 1,000 graded games. The last row is Gate 0's stress figure,
which the Phase 1 economy already put over 2 s before this prompt (docs/GAPS.md,
prompts 02 and 06); a real absence is 4 ticks (multiplayer, 24 h) or up to 48
(single player at 1x), under 0.25 s.

---

## 3. Using it from a host (lanes P and H)

```ts
const director = new AiDirector({ endowments: endowmentsOf(roster), seed });
// each tick, before stepping:
const out = director.decide(state.tick, (id) => state.controllers[id], (id) => viewFor(state, id));
for (const c of out.commands) session.submit(c);
// deliver out.explanations to their audiences, like sim events
const events = session.advance(1);
director.observe(events);
// saving: store director.snapshot() beside the sim save; loading: AiDirector.restore(options, snapshot)
```

`decide` acts for `ai` and `caretaker` nations and never for `human` ones.
`greedyDecide` stays for the Gate 1 harness bots, so Gate 1 results are
untouched. A test plays 30 months, saves the sim and a JSON copy of the AI
snapshot, reloads both and plays 30 more: the final state hash equals an
uninterrupted run.

---

## 4. Memory and saves

The mind's memory, goals and last beliefs are plain integers and strings
(`MindSnapshot`), so they serialise exactly. They are **not** in `State`: the AI
may not write State (seam 2), and the controller slot can change. The host must
save the director snapshot with the game; without it a reloaded game still plays
correctly, but AI nations forget grievances and diverge from an uninterrupted
run. docs/GAPS.md (prompt 10) asks the architect whether AI memory should become
State written through a command instead.

---

## 5. Recipe: adding a behaviour

1. **Say what the player sees.** Write the decision card or the sentence first
   ("declined: you skipped the flood relief"). If it cannot be one short sentence
   with a number, simplify the behaviour (D8).
2. **Find what the AI perceives.** Only View fields and events addressed to the
   nation. If the information is not there, the behaviour needs lane C/S to
   expose it first; do not reach around the View.
3. **Put numbers in tunables.** Every threshold, weight and duration goes in
   packages/sim/src/tunables.ts with a band and a note, and a row in RULES.md
   section 11 (`rules.test.ts` fails otherwise). Read it with `rule(view, id)`.
4. **Write the test first**: a small roster in the test (see
   `retaliation.test.ts`), a scripted human, and assertions on the AI's
   commands and on the exact explanation text.
5. **Pick the layer.** Memory of something that happened: `perception.ts`
   (new `Observation`) and `beliefs.ts` (`remember`). Something the nation
   wants: a goal in `goals.ts`. A move: a proposer in `actions.ts`. An answer:
   `negotiation.ts`. Keep reactions (answers, retaliation) in the reactive part
   of `mind.act`, which the budget never defers.
6. **Explain it.** Every command goes through `push` and `say` in `mind.ts`,
   with the audience that sees the decision. `director.test.ts` fails if any
   command lacks an explanation or a number.
7. **Count its cost.** Call `spend(units)` for each candidate scored.
8. **Re-run the check**: `AI_GATE2_GAMES=200 AI_GATE2_SEED=1001 npx vitest run
   packages/ai/src/gate2.test.ts` to tune (seeds 1001+ only), then once on
   seeds 1-200 to grade.

---

## 6. Crisis contract (proposed, for lanes C and S)

The sim does not model crises yet. The AI reads them through `crisesIn(view)`
and returns nothing until they exist, so today it never pledges. When RULES 4 is
built, the smallest shape the AI needs is:

```ts
// NationView.crises: open crises, public
interface CrisisSeen {
  id: number; kind: 'climate' | 'pandemic'; label: string;   // "flood relief"
  openedTick: number; closesTick: number;                      // pledges count up to closesTick
  pooled: number; target: number;                              // Credit (RULES 4.3)
  pledges: { nationId: NationId; amount: number }[];           // public (RULES 4.3 rule 3)
}
// command the AI sends
{ type: 'pledge', payload: { crisisId: number, amount: number } }
// public event when a crisis closes
{ type: 'crisisClosed', payload: { crisis: CrisisSeen }, audience: [] }
```

If lane C chooses other names, only `perception.ts` changes.

---

## 7. Caretaker mode (design on paper only)

**What it is.** A human in an async game goes quiet (seam 7). Their nation's
controller becomes `caretaker`, and the AI plays it - not in the nation's
data-derived personality, but **in the style the player announced**, so the
nation stays recognisably theirs and nobody can profit from their absence.

**Announcing a style.** Before going away (or at any time), the player picks one
card: *Keep my deals* (strict), *Give second chances* (forgiving), or *Drive a
hard bargain* (exploiter), plus two dials they already have: contribution share
and resilience floor. It is stored as a standing policy (`StandingPolicy.
caretakerStyle`, lane C), so it is in State, visible to its owner only, and
travels with saves. With no announcement, the caretaker uses the nation's own
data-derived style.

**What the caretaker may do.** Everything reactive, nothing that commits the
player's future:
- answer offers (accept, counter, reject) and retaliate by the announced style;
- pledge to crises at the announced contribution share, never above it;
- keep resilience at the floor;
- make offers only to cover a deficit or sell a surplus it already holds, never
  hard bargains unless the player allowed them, never more than half the open-
  offer cap, so the player returns to a board they can still steer.

**What it must not do.** Change standing policies, break a deal, start anything a
Phase 3-4 system adds (projects, treaties, wars), or spend below one month of
reserves.

**Memory.** The caretaker uses the same mind, whose memory has been kept current
while the nation was human (the director perceives for every nation). On return,
the player's recap lists every caretaker decision with its explanation, grouped:
"accepted 6 offers, declined 2 (you broke no deals), pledged 40 to the flood
relief".

**Fairness.** The caretaker never plays better than the player's announced style
would: it uses the same scoring with `aiNoiseBp` and no look-ahead, so going
absent is never a strategy. The Gate 5 test (a week-long 5-player game survives a
dropout) should also check that a caretaker nation's score stays within the band
of the same style played by the AI from the start.

**To build it (later prompt):** lane C adds `caretakerStyle` to `StandingPolicy`;
lane A adds `styleOverride` to `NationMind` (personality with the announced
reciprocity and the player's dials) and the limits above; lane U adds the style
card and the recap group.

---

## 7a. Tunables

All in packages/sim/src/tunables.ts and RULES.md section 11; the AI reads them
from `view.rules`.

| id | value | band | what |
|---|---|---|---|
| `aiGoalRescoreTicks` | 3 | 1-12 | think interval, staggered |
| `aiNoiseBp` | 300 | 0-1000 | seeded jitter on partner scores |
| `aiReciprocityAllianceThreshold`, `aiForgivingImportThreshold`, `aiExploiterExportThreshold`, `aiExploiterImportCeiling` | 40, 60, 30, 40 | RULES 11 | reciprocity style from data |
| `aiStockBufferTicks` | 2 | 1-6 | months of demand kept before selling (shared with the greedy trader) |
| `aiRetaliationWindowTicks` | 2 | 1-6 | latest tick a strict AI has visibly retaliated |
| `aiPunishTicks` | 6 | 2-24 | length of a retaliation |
| `aiForgiveLimit` | 1 | 0-3 | offences a forgiving AI lets pass |
| `aiMemoryDecayPct` | 4 | 1-20 | grievance fading per tick |
| `aiGrudgePerBreak`, `aiGrudgePerSkip` | 40, 20 | 10-100, 0-60 | grievance per offence |
| `aiTrustPriceBpPerPoint` | 20 | 0-60 | price generosity per point of trust |
| `aiCounterRangePct` | 20 | 0-40 | counter instead of reject within this gap |
| `aiExploiterMarkupPct` | 0 | 0-50 | hard bargainer's markup (tuned 20 -> 0) |
| `aiBudgetUnitsPerTick` | 4000 | 500-20000 | per-tick work cap for the roster |
| `aiPledgeMaxIncomePct`, `aiConditionalPledgePct`, `aiFreeRideCoverPct` | 10, 50, 70 | RULES 11 | crisis pledges |

---

## 8. Gate 2 check (prompt 10)

The harness has no `gate2` suite yet and the sim has no crises (docs/GAPS.md,
prompt 10), so `packages/ai/src/gate2.test.ts` measures every Gate 2 criterion
the AI can move today, built like the Gate 1 suite: 200 seeded full-roster games
with every playable nation assigned an archetype at random (cooperator = this
AI in its data-derived style; hoarder, isolationist and trade exploiter = the
harness bots), plus four paired runs per seed (one random nation as cooperator,
isolationist, trade exploiter and betrayer, everyone else unchanged). CI runs 5
seeds; the full run is on demand (section 5, step 8).

**Tuning** (seeds 1001-1400 only, before grading): variants of
`aiExploiterMarkupPct` (0, 5, 10, 20, 35), `aiNoiseBp` (1000),
`aiStockBufferTicks` (3, 4), `aiTrustPriceBpPerPoint` (0, 40) and
`aiCounterRangePct` (0, 40). Only the markup moved the top scorer beyond noise:
pooled over 400 seeds, Brazil tops 15.5% at 20 and 13.5% at 0, and the trade gain
rises (+16.0% to +16.9%). A 3-month stock buffer looked better still (11.0% on
1001-1200, 13.5% on 1201-1400), but that tunable is shared with the Gate 1
greedy bots and pushed their top scorer from 11.0% to 14.5%, so it stays at 2.
Chosen: `aiExploiterMarkupPct` 20 -> 0.

**Graded once, seeds 1-200** (1,000 games):

| Criterion | Result | Pass line | Verdict |
|---|---|---|---|
| Crisis success 40-75% | sim has no crises yet | 40-75% | n/a |
| No archetype over 1.5x fair share (random assignment) | worst bot trade exploiter 0.58x (hoarder 0.34x, isolationist 0.02x); cooperative AI 3.06x | bots <= 1.50x | PASS |
| Reciprocal cooperators beat trade exploiters (paired) | cooperator ahead in 75.5% of pairs, median +6.3% | > 50%, median > 0 | PASS |
| Reciprocal cooperators beat free-riders | free-riding is a crisis act; no crises yet | cooperators ahead | n/a |
| Trailing nation gains nothing by sabotage | no sabotage action exists (RULES 5.3) | saboteur lower | n/a |
| No nation tops more than 2x fair share (Gate 1, waived) | Brazil 16.0% | <= 11.8% | FAIL |
| Trading beats isolating (Gate 1 carried, paired) | median +15.9% | >= +15% | PASS |
| Keeping deals beats breaking them (paired, betrayer) | cooperator ahead in 95.5% of pairs, median +9.6% | > 50%, median > 0 | PASS |
| Strict AI retaliates within the window after a broken deal | 120 of 120 (plus 355 breaks against forgiving AIs) | all, within 2 ticks | PASS |
| Every visible AI decision is explained, with a number | 355,460 of 355,460 commands; all texts numeric | all | PASS |
| Per-tick compute budget | peak 924 of 4,000 units, 0 deferred thinks; 0.36 ms/tick (build machine), 3.1 ms (4x-throttled Chromium) | <= 4,000, 0 deferred | PASS |
| AI commands accepted by the sim | 0 rejected of 355,460 | 0 | PASS |
| Determinism (repeat runs; save + AI snapshot reload) | 10 of 10 identical; reload test identical | all | PASS |

Median ownScore by archetype: cooperator 113.4%, trade exploiter 103.7%, hoarder
100.0%, isolationist 100.0%. Top scorers: Brazil 16.0%, Russia 11.5%, Saudi
Arabia 10.0%, Egypt 9.5%, Japan 9.0%, the rest 6.5% or less.

**Reading of the archetype criterion.** ROADMAP names the archetypes as hoarder,
isolationist, trade exploiter and free-rider; the cooperative AI is what they
are measured against, so the 1.5x line is applied to the bots. The cooperative
AI tops 3.06x its fair share - collaboration beating the alternatives, which is
the game's premise. If the architect reads the criterion as including the
cooperator, it fails (the Gate 1 greedy trader was at 2.8-2.9x for the same
reason). This is an owner decision (docs/GAPS.md, prompt 10).

**The top scorer** was already waived at Gate 1 (12.5-15.0% with the greedy
trader) and prompt 13 traced it to structural near-ties between exporters that
sell their whole surplus. With this AI, Brazil - a food and energy exporter
that sells from month 1 - is the most frequent winner. No AI tunable in band
moved it below about 12.5% on the tuning seeds.
