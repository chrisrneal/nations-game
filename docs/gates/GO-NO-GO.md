# Go / no-go: is the core loop worth building on?

Prompt 13 (go/no-go), 2026-09-30. Written at `main` 1be231c, after prompt 15.
The question: should joint projects (Phase 3) and diplomacy and war (Phase 4)
be built on the current core loop of trade plus crisis response, or should the
loop be reworked first?

Evidence used: docs/ROADMAP.md, docs/RULES.md, docs/gates/GATE-2.md, the Gate 2
balance reports (docs/balance/gate2-p2-prompt09.md, gate2-prompt13.md,
gate2-prompt14.md, gate2-prompt15.md), docs/playtests/, and a recheck of Gate 2
run in this session (below). No game code was changed. Two measurements were
made with scratch scripts that are not committed. Their method is given so that
lane H can make them permanent (docs/GAPS.md).

## The short answer

**Rework the core decision before building anything on it.** Keep the engine and
the phone app. Section 4 has the reasoning.

## 0. Gate 2, rechecked today

The Gate 2 review (prompt 12) was done before prompts 13-15. I re-ran everything
the engine can grade on today's `main`.

| What was run | Result |
|---|---|
| `npm run check` | exit 0 |
| `npm test` | 33 files, **468 tests passed**; 1,000 seeds hash identically in Node and headless Chromium |
| `npm run build`, `npm run e2e --workspace web` | **53/53** phone checks at 360 px: trade in 2 taps, crisis card in 2 taps, **60.1 fps** at 4x on a 4x-slowed CPU, 24-hour catch-up 98 ms, recap 6 lines and 73 words |
| `npm run harness -- --suite gate2 --games 200 --seed 1` | suite FAIL; every number matches docs/balance/gate2-prompt14.md exactly |
| `npm run harness -- --suite gate2 --games 200 --seed 201` | suite FAIL; every number matches the "old rule" column of docs/balance/gate2-prompt15.md exactly |

| # | Criterion | Seeds 1-200 | Seeds 201-400 | Now |
|---|---|---|---|---|
| 1 | Crisis success 40-75% | 56.6% of 1,182 | 59.7% of 1,170 | **PASS** |
| 2 | No archetype over 1.5x fair share | cooperator **3.90x**, free-rider 1.05x | cooperator **3.50x**, free-rider 1.15x | **FAIL** as worded. The free-rider defect is fixed (prompt 14). The cooperator's share needs the owner's ruling on the wording |
| 3 | Reciprocal cooperators beat free-riders | ahead in 90.5% of pairs, median +5.47% | 90.5%, +5.81% | **PASS** (was +0.17% at the review) |
| 4 | A trailing nation gains nothing by sabotage | spoiler 978 vs 1,105; stealth spoiler 1,042 vs 1,105 | 993 vs 1,109; 1,050 vs 1,109 | **PASS** on the median. The stealth spoiler still beats its own cooperative game in 8.5% of pairs |
| 5 | Owner predicts AI responses 70%+ | no data | | **NOT DONE**. The base-rate flaw (F2) is fixed, so a score would now mean something |
| 6 | 24 h absence, recap under a minute | 0 / 0 / 0, at most 137 words | 0 / 0 / 0, at most 129 words | **PASS** (engine and headless phone) |
| 7 | 10 playtests, 3+ by others, most want another game | `docs/playtests/` holds only `.gitkeep` | | **NOT DONE: 0 of 10** |
| 8 | Depth budget and 60 fps | 53/53 phone checks | | **PASS** (headless; owner to confirm on a phone) |
| 9 | Gates 0-1 pass | Gate 1 rerun: trade +17.1%, isolating lower in 98.0%, 0 dead | +17.8%, 99.0%, 0 dead | **PASS WITH WAIVERS** |
| 9b | Top scorer at or under 11.8% | Saudi Arabia **21.0%** | Saudi Arabia **22.5%** | **FAIL**. Five prompts have not fixed it. Prompt 15 recommends a second written waiver |

**Gate 2 is still FAIL.** Since the review, prompt 13 fixed F1 (the harness now
grades the AI the phone plays), prompt 13 fixed F2 (a paid-up nation no longer
shows as "declined"), and prompt 14 fixed the free-rider. Everything left is
either an owner ruling (lines 2 and 9b) or has never been attempted (lines 5 and
7). **The gate's own go/no-go question, "most want another game", has not been
asked of a single person.**

## New measurements (scratch scripts, not committed)

Neither measurement exists in the harness. Both answer the question the gate
cares about most: do the player's choices matter?

**A. Playing vs doing nothing.** 170 paired games (seeds 1-170, 10 per nation),
an all-AI world like the phone's. In each pair, one nation is played by the
shipped AI in one game, and in the other it is left idle all game on the default
standing policies (the harness's `away` option, from month 0 to the end).

| | Result |
|---|---|
| Pairs where playing beats idling | **170 of 170** |
| Median gain from playing | **+14.5%** of final score (p10 +4.6%, p90 +22.6%) |
| Median rank (of 17) | played 9, idle 16 |
| Games topped | played 11, idle 0 |
| Gain by nation (median of 10 pairs) | Saudi Arabia 25.5%, Egypt 24.0%, India 20.6%, China 20.3%, Nigeria 18.5%, Indonesia 18.2%, Brazil 16.0%, Russia 14.8%, Canada 14.5%, South Africa 13.2%, United States 11.8%, Australia 10.9%, Germany 10.2%, **Turkiye 7.7%, Japan 6.7%, Korea 4.0%, Mexico 3.8%** |

**B. What a player is asked to decide.** 85 games (seeds 1-85, 5 per nation),
one nation idle on default policies, all others the AI:

| Per game (60 months) | Result |
|---|---|
| Trade offers received | 26.0, all answered by standing policy |
| Crisis appeals with a share to pay | 6.0 |
| Appeals **already paid in full** by the default monthly contribution when they open | **71.9%** |
| Crisis hits | 6.0, typically 1.6-3.8% of output for 6 months (recaps) |

So about **1.7 crisis appeals per game** are a live decision. The rest is
trade: each month a shortfall or surplus card offers a pre-filled fair offer
(apps/web/src/ui/cards.ts). The alternatives are "ration at home", which loses
output, and "keep it", which holds a surplus that earns nothing.

## 1. The strongest honest case to continue

- **The premise is true in the numbers.** Trading beats isolating by +17.1% and
  +17.8% (Gate 1 line, 98-99% of pairs). Paying into the pools beats free-riding
  in 90.5% of pairs. Sabotage scores below cooperation on the median, and closing
  trade to sabotage paid in 1 of 200 pairs. "Collaboration beats conquest" is not
  a slogan here. The harness can show it.
- **Playing matters, every time.** An active nation beat the same nation left
  idle in 170 of 170 pairs, by a median 14.5%. The idle nation topped 0 games.
  The player is not a passenger.
- **The engine is finished and trustworthy.** 468 tests pass, including
  1,000-seed determinism across Node and Chromium. There have been 0 crashes and
  0 negative stocks in thousands of games. The 24-hour absence test passes.
  60 fps holds on a slowed phone profile, and every decision is 2 taps. The nine
  seams are signed off. Phases 3 and 4 need all of this and would not have to
  rebuild any of it.
- **Every Gate 2 failure left is a ruling or a to-do, not a broken game.** The
  archetype line fails because good trading beats bad trading on purpose. Prompts
  09, 13, 14 and 15 all conclude the wording needs a ruling. The top-scorer line
  fails by a few points of luck across 12 contenders (prompt 15, section 5).
  Lines 5 and 7 have never been attempted, so they have not failed either.
- **A playtest is cheap.** A whole game takes 10 minutes at 1x
  (apps/web/src/platform/pace.ts). The missing evidence is an evening away, not a
  rewrite.

## 2. The strongest honest case to stop or rework

- **Nobody has played it.** There are 0 of 10 playtests, 0 prediction files and
  0 "would you play again" answers. The MVP has been playable on a phone since
  prompt 11. Every prompt since (12 to 15) went into the review and into balance
  lines a player never sees. None went into whether it is fun. The gate calls this
  the go/no-go criterion, and we have no data on it.
- **The decisions have obvious answers.** Measurement B: 72% of crisis appeals
  are paid before the player sees them. Every trade card leads with a pre-filled
  fair offer, and its alternatives only lose. The 14.5% that play is worth is
  earned by tapping the right answer often enough, not by choosing between two
  good options. That is a chore loop, not a strategy loop.
- **Money has nothing to compete for.** Credit sinks are **0.7% of Credit
  income**, unchanged since Phase 2 prompt 09. The review flagged this as F3:
  "Defection is nearly free... the playtests may show it as 'my choices in a
  crisis don't matter'". Contributing only beats free-riding because prompt 14
  added a rule that halves a non-payer's cover. Before that, the gap was +0.17%.
  The tension is imposed, not natural.
- **Crises barely bite.** A hit costs about 2-4% of output for 6 months. One
  saboteur moves the world multiplier by a median -0.002 to -0.003, and sinks a
  shared goal in about 6% of games. The "collaboration" half of the premise runs
  on autopilot.
- **Which nation you pick decides whether you can win.** Japan and Mexico top 0%
  of games, and Germany and Korea 0.5% (seeds 1-200). For Japan, Korea, Mexico
  and Turkiye, playing well is worth only 4-8% over doing nothing. A player handed
  Japan learns in one game that their choices barely move them. Prompt 15 showed
  no scoring rule fixes this, because those nations sit at the 30% shortfall cap
  whatever they do.
- **Phases 3 and 4 inherit the flaw.** Joint projects, treaties and war are new
  ways to spend Credit and trust. Gate 3 needs "withdrawal sometimes rational,
  always costs trust", which only means something if resources are scarce. On a
  core where money piles up unused and the right answer is pre-filled, three more
  systems would be three more menus with obvious answers.

## 3. The single change most likely to improve "would play again"

**Give Credit a second use that competes with trade: domestic investment.**
A nation spends Credit to raise its own Food or Energy production, slowly and
with diminishing returns. That money then cannot pay for imports or fund the
crisis pools.

Why this change over the others:
- **It turns every card into a real choice.** "Buy 40 food from Brazil now" would
  compete with "build 3 food a month from month 24". Paying the pool would compete
  with building. None of those answers is always right, and the right one would
  depend on trust, on partners and on crises. That is the game's own theme: depend
  on partners or pay to be self-reliant. Collaboration still has to win on
  average, and the prompt below makes that a graded target.
- **It fixes the thin-margin problem.** Credit gets real value, so declining a
  crisis appeal saves money you can use. Paying becomes a sacrifice instead of a
  default.
- **It gives the nations that cannot win a lever.** Japan, Korea, Mexico and
  Turkiye are Credit buyers stuck at the shortfall cap. Investment is the one
  thing that can move a nation's own production, so it can move them.
- **It fits the depth budget.** It can be one dial (extending the resilience-floor
  dial) and one card, with nothing more than two steps deep. It needs no new
  resource in the strip.

Rejected as the single change:
- **Fixing the top scorer again.** Five prompts have tried. A player never sees a
  200-game win rate.
- **Bigger crises.** They raise the stakes, but the default policy would still
  pay the answer before the player sees it.
- **A shorter game.** A game is already 10 minutes at 1x.
- **Running the playtests.** It is essential, but it measures the game rather
  than changing it. The prompts below include it.

This is a prediction from engine evidence. Only playtests can confirm it.

## 4. Recommendation

Do not build joint projects, diplomacy or war on this core yet. The engine is
excellent and stays. What sits on top of it has not been shown to be a game:
nobody has played it, and the evidence we do have says each monthly decision
has an obvious answer, money has nothing to compete for, and a third of the
nations can neither win nor move much. Stop tuning the top-scorer line. Five
prompts is enough: waive it and rule on the archetype wording. Spend the next
build on one change to the core decision (domestic investment competing with
trade and the crisis pools), with pre-registered targets and revert-if-it-fails.
Then run the 10 playtests before any Phase 3 prompt is written. Play three
10-minute games of today's build first, so there is a before to compare with.
If most testers still say no after the rework, rethink the premise, not the
numbers.

## 5. Rework prompts

Run them in order. Prompt 16 is docs only and can run alongside prompt 17.
Pasting prompt 16 is the owner's written ruling and waiver, so paste it only if
you agree with it.

### [16] Gate 2 rulings. Model: Opus 5.5 (`claude-opus-5-5`)

```
[16] Gate 2 rulings

You are the architect for this session: you may edit docs/ROADMAP.md and docs/DECISIONS.md (CLAUDE.md). Docs only, no code. Read docs/ROADMAP.md, docs/DECISIONS.md, docs/gates/GATE-1.md, docs/gates/GATE-2.md, docs/gates/GO-NO-GO.md, docs/balance/gate2-p2-prompt09.md, docs/balance/gate2-prompt14.md and docs/balance/gate2-prompt15.md.

The owner has made two rulings. Record them.

1. Gate 2 criterion 2 is reworded to what it protects against: "No defecting archetype (free-rider, hoarder, exploiter, isolationist) tops the score in more than 1.5x its fair share, and none tops it more often than the reciprocal cooperator, with nations assigned at random." Reason: as worded, the line cannot pass while Gate 1 requires trading to beat isolating by 15% (docs/balance/gate2-p2-prompt09.md). Write a decision record in docs/DECISIONS.md in the existing format and update the Gate 2 line in docs/ROADMAP.md. Check whether Gate 4's "warmonger and betrayer at or under 1.5x" line has the same flaw; say what you decided and why.

2. The top-scorer line (Gate 1 criterion 5, GATE-2 line 9b) is waived a second time, for Gate 2 only. Add a "Waivers" section to docs/gates/GATE-2.md in the format GATE-1.md uses, citing docs/balance/gate2-prompt15.md section 5. In the same decision record, decide how the line is graded from Gate 3 on so that a pass means fairness rather than luck (prompt 15, section 6, option 2 lists two ways). Record which and why. Do not tune anything to it now.

Update the Gate 2 checklist in docs/PROGRESS.md (lines 2 and 9b under the new wording and waiver) and add a session-log entry. Open a pull request titled "[16] Gate 2 rulings" and merge it yourself once CI passes. Reply to the owner in 3 lines.
```

### [17] A real budget: self-reliance vs trade. Model: Opus 5.5 (`claude-opus-5-5`)

```
[17] A real budget: self-reliance vs trade

Lanes: D (docs/RULES.md, docs/balance/, docs/GAPS.md), C (packages/contracts), S, A, H. Write the RULES text first yourself, then hand independent parts to subagents, one lane each.

Read docs/gates/GO-NO-GO.md first: it is why this prompt exists. Then RULES.md sections 2, 3, 4, 5.3, 8 and 11, docs/AI_DESIGN.md, and docs/balance/gate2-prompt14.md and gate2-prompt15.md.

The problem. The monthly decisions have an obvious right answer, and Credit has nothing to compete for. Credit sinks are 0.7% of income. 72% of crisis appeals are already paid by the default monthly contribution when they open. Every trade card's first option is a pre-filled fair offer, and its alternatives only lose. For Japan, Korea, Mexico and Turkiye, good play is worth only 4-8% over doing nothing, and they almost never top the score.

The change. One new use of Credit: domestic investment. A nation spends Credit to raise its own Food or Energy production capacity, slowly (a lag of months) and with diminishing returns. It competes with imports and with crisis-pool payments for the same Credit. The theme: depend on partners (cheaper now, exposed to their choices and to crises) or pay to be self-reliant (dearer, slower, safe). Collaboration must still beat self-reliance on average.

Constraints:
- Design first, in RULES.md: a new subsection in section 2, plus sections 8 and 11. Give every formula with its tunables and bands before any code.
- Decision cards plus standing policies: prefer extending an existing dial (e.g. the resilience floor becomes "home investment") over adding a sixth. At most one new card type, 2 taps to resolve.
- RULES 5.3 must hold. Investment is the nation's own, nothing transfers, and nothing a player does moves any baseline. Add a test that pins this.
- Investment is a named Credit sink in the conservation invariant.
- Integer maths. Tunables go in tunables.ts with bands, and RULES.md and tunables.ts must agree (rules.test.ts).
- New State fields: bump the save schema with a migration, as Phase 2 prompt 09 did.
- The shipped AI (packages/ai) decides how much to invest, from its own View only, with a numeric reason on every command like its other decisions. The harness must grade the AI the phone plays (GATE-2 finding F1).
- Write tests first for sim and ai logic.
- No UI in this prompt. Lane U builds the card and the dial next. Log what it needs in docs/GAPS.md.

Harness (lane H):
- Add two permanent lines to the gate2 suite, measured as in docs/gates/GO-NO-GO.md. (1) The same nation, on paired seeds, played by the AI vs left idle on default standing policies all game: median gap overall and per nation. (2) Decision density for an idle nation: offers received, crisis appeals, and the share of appeals already paid in full when they open.
- Add fixed-rate investment strategies (for example 0, 10, 25 and 50% of spare Credit) for target 2.
- If prompt 16 has merged, grade the archetype line with its new wording.

Pre-registered targets. Tune only on seeds 1001-1400. Grade once on seeds 1-200 and 201-400, and change nothing after grading.
1. Credit sinks are 8-25% of Credit income, with the AI playing.
2. A real trade-off exists. Across the fixed investment rates, the best rate is not the same for every nation: at least three different rates are each best for at least two nations. Both "never invest" and the highest rate score at least 3% below the best rate for the median nation.
3. Credit buyers get a lever. The AI-vs-idle median gap is at least 8% for each of Japan, Korea, Mexico and Turkiye (today 4-8%), and at least 10% overall (today 14.5%).
4. Collaboration still wins. Gate 1's trading vs isolating stays at +15% or more, with the isolationist investing by the same default policy.
5. Every Gate 1 and Gate 2 line that passes on main today still passes: crisis success 40-75%; the cooperator ahead of the free-rider in 70%+ of pairs by a median +3% or more; both spoilers strictly below the cooperator; the 24-hour absence test at 0 / 0 / 0 with recaps of at most 6 lines and 150 words; dead states under 2%; determinism; 0 crashes; 0 negative stocks.
6. Report the top-scorer line; do not tune for it.

If any target fails on the graded seeds, do not re-tune on them. Revert the rule in the same pull request, as prompt 15 did, and say why. Either way, write docs/balance/gate2-prompt17.md: design, tuning table, graded results and a decision for the owner.

Finish as CLAUDE.md says. Pull request title: "[17] A real budget: self-reliance vs trade".
```

### [18] Invest on the phone. Model: Sonnet 5.5 (`claude-sonnet-5-5`)

```
[18] Invest on the phone

Lanes: U and P. Start only after prompt 17 has merged with its rule kept. If prompt 17 reverted its rule, change nothing and reply saying so.

Read docs/gates/GO-NO-GO.md, the new investment section of docs/RULES.md and its section 8, the prompt 17 entries in docs/GAPS.md, and the mobile depth budget in docs/ROADMAP.md.

Build:
- The investment dial (or extended dial) that RULES 8.2 now describes, on the Game tab. Its why-sheet says in one sentence what this month's investment returns and from when.
- The investment decision card that RULES 8.1 describes: 2 taps to resolve, with the first option in the bottom third. Its options show the real trade-off in plain words, for example "Buy 40 food from Brazil now · 120 credit" vs "Build 3 food a month from month 24 · 300 credit". All numbers come from the View.
- The shortfall and crisis cards mention the investment alternative when it exists, in one line each.
- The resource strip and why-sheets show Credit committed to investment.
- The away recap mentions investment only when it changed something, staying within 6 lines and 150 words.
- Extend the phone check (npm run e2e --workspace web): the new card resolves in 2 taps; no horizontal scroll at 360 px on every new screen and sheet; tables at most 4 columns; 60 fps at 4x on a 4x-slowed CPU.

No sim, AI or contracts edits. Log anything missing in docs/GAPS.md. Finish as CLAUDE.md says. Pull request title: "[18] Invest on the phone".
```

### [19] Playtest kit. Model: Sonnet 5.5 (`claude-sonnet-5-5`)

```
[19] Playtest kit

Lanes: U, H, and D for docs/playtests/ only. Start after prompt 18 has merged.

Gate 2 needs 10 playtests, 3 or more by other people, and "most want another game" (docs/ROADMAP.md). docs/playtests/ is empty. Make recording a playtest take under a minute for someone who is not a programmer.

Build:
- At game over, before the final table, three questions, answerable in taps and skippable: "Who played?" (Owner / Someone else), "Would you play another game?" (Yes / Not sure / No), and "Which choice felt most interesting?" (one optional line). Store the answers in the exported save, next to the prediction answers.
- The export button at game over saves the file as playtest-<date>-<nation>.json.
- npm run harness -- predictions --dir docs/playtests also tallies the playtests: how many by the owner and by others, the "would play again" counts for each group, every interesting-choice line, and the Gate 2 line 7 verdict.
- docs/playtests/README.md, in plain language: how to run a playtest (open the app from its web address, pick a nation, play one game at 1x, about 10 minutes, with prediction mode on for the owner's first game), answer the questions, export the file and send it; and how the owner adds a file to the repository through GitHub's web page.
- Extend the phone check for the questions and the export.

No sim or AI edits. Finish as CLAUDE.md says. Pull request title: "[19] Playtest kit".
```

Then the owner runs the 10 playtests (3 or more by other people) and adds the files to `docs/playtests/`.

### [20] Gate 2 re-review. Model: Opus 5.5 (`claude-opus-5-5`)

```
[20] Gate 2 re-review

Independent review. Docs only: docs/gates/GATE-2.md and docs/PROGRESS.md. Start only when docs/playtests/ holds 10 playtest files.

You did not build this code. Do not take docs/PROGRESS.md, docs/balance/ or the builders' comments as evidence: run everything yourself. Re-grade every Gate 2 criterion in docs/ROADMAP.md, using any rewording or waiver recorded in docs/DECISIONS.md and docs/gates/GATE-2.md, and Gates 0 and 1, the way the prompt 12 review did (docs/gates/GATE-2.md, "What was run"). Also rerun the two measurements in docs/gates/GO-NO-GO.md (AI vs idle, decision density) and the prompt 17 targets on fresh seeds 401-600.

For criteria 5 and 7, grade the files with npm run harness -- predictions --dir docs/playtests. Report "would play again" separately for the owner and for others, and quote every "most interesting choice" line.

Add a new dated verdict section at the top of docs/gates/GATE-2.md and keep the prompt 12 review below it. The verdict is PASS, PASS WITH WAIVERS (only for waivers made in writing), or FAIL. If it fails on fun (most testers do not want another game), say so first and plainly: the ROADMAP says to iterate Phase 2. Update the Gate 2 checklist and the session log in docs/PROGRESS.md. Open a pull request titled "[20] Gate 2 re-review" and merge it once CI passes. Reply to the owner in 5 lines.
```

## How to reproduce

```
npm run harness -- --suite gate2 --games 200 --seed 1
npm run harness -- --suite gate2 --games 200 --seed 201
```

Measurement A: for seeds 1-170, nation = playable[(seed - 1) % 17]. Compare
`playGame({ seed, ticks: 60, roster, humanSwitch: false })` with the same call
plus `away: [{ nation, from: 0, to: 61 }]`, and read that nation's `finalScore`
from `score.nations`. Measurement B: the idle game only, seeds 1-85. Count
`offerMade` events whose `payload.offer.to` is the nation, and `crisisOpened`
events where the nation's share is above 0. An appeal counts as prepaid when the
pool's `round[nation]` already covers the share at that moment.
