# Gate 2 balance report: prompt 17b (home investment, second attempt)

2026-09-30. Lanes D, S, A, H. Tuned on seeds 1001-1400 only. **Nothing was graded.**
The grading seeds (601-800 and 801-1000) were run once, on `main`, for the "today"
column and not again. Seeds 401-600 were not run.

## Verdict: STOPPED at tuning, rule reverted, nothing graded

The prompt's tuning rule says that if no setting inside the bands puts the free-rider
share, targets 2(b) and 2(c) and the four Credit buyers where they must be on both
tuning ranges, tuning stops, the rule is reverted and nothing is graded. That is
what happened.

I tried **133 settings** of the rule on seeds 1001-1200 (AI and rule knobs, below),
and six of them on both tuning ranges with the fixed-rate sweep. **Not one** put
Japan, Korea, Mexico and Turkiye all between +9% and +15% over idle, on either range
(not one even put three of them there). The reason is structural, not a matter of
another decimal: section 4.

| What the 133 settings showed (seeds 1001-1200) | Count |
|---|---|
| All four Credit buyers within +9% to +15% | **0** |
| Korea and Turkiye both at +9% or more | 28 |
| ...and Mexico at +15% or less as well | **0** |
| Mexico at +15% or less *and* Credit sinks at 8% or more | **0** |
| Sinks at 8% or more, and the most frequent top scorer within main's +4 points | **0** |
| Whenever Mexico is at +15% or less, the best Korea / Turkiye reached | +7.1% / +7.0% |

The state on `main` after this pull request plays exactly as before it (packages
and RULES.md are byte-identical to `da07e5a`, checked with `git diff`). The two
AI-vs-idle lines that exist on `main` stay. The whole attempt is preserved at commit
`c579cbc` (it stays in `main`'s history because this pull request is merged with a merge
commit): RULES 7.5 and 8.1, the AI's trade-gain
pricing with its tests, the card tracker, the reworded grading, and the fast `tune`
command. To bring it back:
`git checkout c579cbc -- packages docs/RULES.md` and delete
`packages/harness/src/idle-suite.ts` and `idle-suite.test.ts` (the same two lines
live in `invest-suite.ts` there). One director test fails at that commit with the
default values (Germany no longer invests: section 3); the tests for the new code
pass.

**This was the second and last attempt.** Section 6 recommends joint projects
(Phase 3) instead, not a third attempt.

## 1. Step 1: `main` today, on the grading seeds

`npm run harness -- gate2 --games 200 --seed 601` and `--seed 801`, on `main` as it
was (commit `da07e5a`). These are the "today" column for every guard; they stay
valid if the rule is ever tried again on these seeds.

| Line | Seeds 601-800 | Seeds 801-1000 |
|---|---|---|
| Crisis success (40-75%) | 62.6% | 62.1% |
| Defecting archetypes (G1: each at most 1.5x, none above the cooperator) | free-rider 1.04x, hoarder 0.19x, exploiter 0.08x, isolationist 0.00x; cooperator 3.58x | free-rider 1.43x, hoarder 0.16x, exploiter 0.05x, isolationist 0.02x; cooperator 3.33x |
| Cooperator ahead of the free-rider (70%+, median +3%) | 94.0%, +5.20% | 91.0%, +5.57% |
| Spoiler and stealth spoiler vs cooperator (median from mid-game) | 984 and 1050 vs 1129 | 986 and 1036 vs 1103 |
| 24-hour absence (0 / 0 / 0, recap at most 6 lines and 150 words) | 0 / 0 / 0, 129 words | 0 / 0 / 0, 137 words |
| Dead states; crashes; negative stocks | 0.0%; 0; 0 | 0.0%; 0; 0 |
| Trading vs isolating (Gate 1; at least +15%) | +17.7% | +18.1% |
| Credit sinks / income | 0.7% | 0.7% |
| Most frequent top scorer, archetype games (waived, G1) | Saudi Arabia 22.5% | Saudi Arabia 27.5% |
| Most frequent top scorer, Gate 1 mix (waived) | Saudi Arabia 17.5% | Saudi Arabia 14.5% |
| AI vs idle, overall | +14.2% | +14.1% |
| AI vs idle: Japan, Korea, Mexico, Turkiye | +6.1, +4.7, +6.1, +3.2% | +6.6, +5.4, +6.6, +5.9% |
| AI vs idle: China / Saudi Arabia / Germany | +19.7 / +26.8 / +7.8% | +20.3 / +28.2 / +6.7% |
| Decision density, idle nation: offers, appeals, prepaid | 26.3, 6.2, 73.1% | 26.2, 6.0, 74.7% |

The free-rider share alone moves 1.04x to 1.43x between two ranges of `main`. On
the tuning ranges `main` reads 1.25x (1001-1200) and 1.37x (1201-1400), so the
tuning rule's "free-rider at most 1.35x on both ranges" is one that `main` itself
does not meet on the second.

## 2. Step 2: the graded state, restored and reproduced

`git checkout 5fb24a3 -- packages docs/RULES.md`, then `idle-suite.ts` and its test
deleted. `npm test` (533 tests, including the 1,000-seed Node-vs-Chromium hash
check) and `npm run check` passed. The tuning ranges reproduced section 3E of
the prompt 17 report to the last digit, with the old gate2 suite and again with the
new `tune` command at the prompt 17 setting (`aiInvestTradeLossPct=0`):

| | 1001-1200 | 1201-1400 |
|---|---|---|
| Distinct best rates; never / highest below best (nations) | 4; 3.2% (9) / 3.2% (11) | 4; 2.5% (8) / 3.2% (12) |
| Free-rider share | 1.18x | 1.20x |
| AI vs idle overall; Japan, Korea, Mexico, Turkiye | +20.6%; +23.0, +20.5, +30.5, +27.2% | +20.5%; +22.9, +20.3, +30.3, +27.3% |
| Credit sinks, all-AI world | 8.5% | 8.5% |

## 3. What was built (all at commit `c579cbc`)

**RULES 7.5: the AI prices what building does to trade.** Written first, revised
once. The first text (every unit built comes off what the nation buys) was
implemented and tried, and was wrong: Japan, Korea and Turkiye fell to +4-18% and
the AI stopped investing (all-AI investment sinks 6.1%). A diagnostic on China
(seeds 1001-1008, a nation with a small shortage that trade already covers) showed
the real mechanism: with the prompt 17 plan China built 28 points of energy, its
trades fell from 266 to 32 a game, its capacity ended 1.03x its baseline against
1.25x when it never invests, and its score fell 8%. Purchases follow the *real*
deficit, so a unit of capacity takes only the world's cover share off what a
nation buys and only the rest off what it goes short of. The plan kept chasing a
shortage that its own building was feeding. The second text is that model: a plan
builds `need / (1 - k)` points (`k` = the world's cover times
`aiInvestTradeLossPct`), counts only the shortage it really closes, and is charged
the trade gain it gives up when its purchases fall below its fair share. It reads
the View only, in integers, with the tests first (22 tests in
`packages/ai/src/invest.test.ts`, including a property test that net and cost
never rise with the loss percentage, and a test that at 0 the plan is prompt 17's
exactly).

What it did, on the tuning ranges at prompt 17's other settings (AI vs idle, China):
**+10.8% and +10.4% without it, +15.5% and +15.1% with it; `main` +19.8% and
+20.1%.** So the fix recovers about half of China's loss and not all of it: target
8 (no nation more than 3 points below `main`) would still have failed for China by
1.3-2 points. It also weakens the deep importers more than intended at the
default payback hurdle (Germany +27% to +18%, Japan +23% to +9-11%, investment
sinks 7.8% to 2.1%), which is why the AI "barely invests" at the default values.

**RULES 8.1: when the card is shown.** Once per shortage, open for
`investCardOpenTicks` (1) month, then quiet for `investCardQuietTicks` (3, a season)
unless the gap has grown by `investCardGrowthBp` (500); a shortage ends when a month
passes with nothing unmet. Four new tunables, in RULES 11 and `tunables.ts`. The
harness tracker has nine scripted tests. **Result: for an idle nation the card
would be open 14.5-14.7 months of 60, down from 36.6-37.2.** That is a working
throttle, and it is independent of the rule's outcome: if home investment is ever
built, use this.

**Harness.** Targets 2 and 3 reworded as the prompt says (2b and 2c count nations,
at least 6; 3 is +8% to +16% for each of the four); `gate2.json`; and a `tune`
command that plays only what the tuning rule needs (archetype games and the
invest lines): 160 s per 200 games with the rate sweep, about 60 s without it,
against about 300 s for the whole gate2 suite.

## 4. Tuning (seeds 1001-1400 only), and why no setting can work

133 settings on seeds 1001-1200 (200 games each, `tune --no-rates`), then six on
both ranges with the sweep. The knobs, in the order the prompt gave, then the rest
of the bands:

| Family (settings) | Varied | What it did |
|---|---|---|
| A-F (6) | payback 10-55, trade-loss 50-100, cost 1300-3000, ceiling 60 | Payback 10-25 builds (sinks 5-10%) and gives Mexico +20-30% whatever the cost. Payback 55 and above barely builds (sinks under 3%). |
| S (48) | payback 10-100, trade-loss 25-100, ceiling 50-100, cost 1300-3000 | A sharp split: either the AI builds (sinks 7-17%, the four at +17-31%, Saudi Arabia on top of 35-37% of games) or it does not (sinks 1-3%, the four at +3-13%). The ceiling of 50-100 did nothing. |
| T (36) | the same with ceiling 20-40 (inside the 20-100 band) | A low ceiling trims Saudi Arabia a little (31-35% top) and the deep importers' lever with it; Mexico stays at +19-30%. |
| U (16) | default dial 0 / 1000, upkeep 100 / 200 | Upkeep 200 kills the lever everywhere (Mexico +7-14% but Korea +4-7%, sinks 1-5%). A default dial of 1000 lowers Mexico by 1.5-6.5 points and Korea with it. |
| V (27) | escalation 1-8, lag 1-6, AI spending share 25-100% | Escalation 4-8 brings Saudi Arabia to 25-29% and Mexico to +10-20%; Korea and Turkiye stay at +4-7% and sinks fall to 3.5-5%. |

The six finalists, both ranges, with the fixed-rate sweep. Only the prompt 17
setting (W0) has a lever of the old size; the rest are the closest to the target
band.

| Setting (aiInvest... / invest...) | Range | Sinks | AI vs idle: J / K / M / T | Free-rider | Saudi top | 2a / 2b / 2c |
|---|---|---|---|---|---|---|
| W0 prompt 17 (trade-loss 0, payback 55, cost 1300, ceiling 100) | 1001 | 8.5% | +23.0 / +20.5 / +30.5 / +27.2 | 1.18x | 36.5% | 4 / 9 / 11 |
| | 1201 | 8.5% | +22.9 / +20.3 / +30.3 / +27.3 | 1.20x | 34.0% | 4 / 8 / 12 |
| W1 the new plan at the default values (trade-loss 100) | 1001 | 2.8% | +8.6 / +6.9 / +8.0 / +3.8 | 1.35x | 33.5% | 4 / 8 / 5 |
| | 1201 | 2.8% | +11.1 / +5.3 / +8.8 / +4.2 | 1.55x | 33.5% | 4 / 8 / 5 |
| W2 payback 25, ceiling 20, cost 3000, default dial 1000, escalation 4, lag 6, share 50% | 1001 | 4.9% | +8.4 / +6.0 / +10.9 / +5.2 | 1.35x | 27.0% | 4 / 8 / 2 |
| | 1201 | 4.9% | +7.5 / +4.9 / +12.5 / +5.3 | 1.43x | 24.0% | 3 / 8 / 1 |
| W3 payback 25, ceiling 20, cost 3000, default dial 1000, share 100% | 1001 | 7.2% | +10.1 / +5.7 / +16.3 / +6.2 | 1.32x | 33.0% | 4 / 4 / 2 |
| | 1201 | 7.2% | +8.8 / +5.8 / +14.4 / +5.5 | 1.53x | 32.5% | 3 / 6 / 1 |
| W4 as W3 at the default share and lag | 1001 | 6.3% | +9.8 / +4.9 / +12.9 / +4.3 | 1.32x | 31.0% | 4 / 5 / 0 |
| | 1201 | 6.3% | +10.4 / +5.5 / +12.6 / +3.9 | 1.43x | 29.0% | 4 / 5 / 0 |
| W5 payback 10, ceiling 20, cost 1300 | 1001 | 4.2% | +15.8 / +8.1 / +24.1 / +9.6 | 1.30x | 34.5% | 5 / 6 / 1 |
| | 1201 | 4.2% | +18.4 / +5.3 / +25.7 / +8.7 | 1.45x | 34.0% | 3 / 6 / 1 |

Pass lines of the tuning rule: free-rider at most 1.35x, 2b and 2c at least 7, the
four nations within +9% and +15%, on both ranges. Main itself, on the same seeds,
reads 1.25x and 1.37x for the free-rider and +5.5 / +4.7 / +5.1 / +4.5% and
+5.9 / +4.7 / +3.7 / +3.7% for the four. Targets 1 (sinks at least 8%) and 7
(Saudi Arabia at most 4 points above main's 24.5% and 23.5%) are also missed by
every weak setting.

### Why, in four lines

1. **Mexico and Korea/Turkiye cannot be separated.** Mexico's shortage is moderate
   (about 54 points after trade), so every point it builds pays at once; Korea,
   Turkiye and Japan are at the shortfall cap, and their first points only clear a
   dead zone. Any setting that makes the AI build at all gives Mexico +19% or more;
   any setting that holds Mexico under +15% gives Korea and Turkiye under +7.1%.
   Payback, cost, ceiling, upkeep, the default dial, escalation, lag and the
   spending share move both together. The four-nation band of +9-15% needs them
   apart.
2. **Credit sinks and a weak lever pull opposite ways.** Sinks of 8% need the AI to
   spend about 7% of income on building. That builds enough capacity to give
   shallow-shortage nations their lever. The only settings at 8% sinks or more are
   the ones with the lever at +17-31%. A dearer point (cost 3000) raises sinks per
   point, but a weaker AI builds fewer points: in 133 settings, none has Mexico
   under +15% and sinks at 8%.
3. **Saudi Arabia cannot be held.** It tops 24.5% of games with no building and
   31-37% as soon as its AI builds anything, even 20 points of food (a ceiling of
   20). Its food gap is the structural one, its trade gain comes from selling
   energy (so building costs it nothing in RULES 3.3), and the score margin at the
   top is thin. Target 7 (at most +4 points) is met only by settings where the AI
   does not build for it, which are the settings that fail target 3.
4. **Target 2(c) fails on its own when the lever is weak.** The highest fixed rate
   costs 7 or more nations 3% or more against their best only when building is
   cheap and uncapped. In all five weak finalists of section 4, 2c is 0-5 of 17 nations.

Credit is not scarce in this economy (prompt 17 report, section 5): the score
counts output, not Credit, so a nation that builds more pays only upkeep, and a
price can make the AI build less without making it build worse. What is scarce
is goods. A rule that only prices Credit against output cannot give some nations
a moderate lever without giving the others an unbounded one.

## 5. What the attempt leaves that is worth keeping

- **The card rule (RULES 8.1, at c579cbc).** 37 open months of 60 became 14.6, with
  no change to the sim. Any future build/invest card should use it.
- **The diagnostic.** A builder that cuts its own purchases stops growing; the
  loss is about the share of its deficit it closes at home. If a later rule lets
  nations produce for themselves, price this in the AI from day one.
- **The `tune` command and the `gate2.json` file** (at c579cbc): a whole tuning
  setting on one 200-game range in 60-160 s.
- **Main's "today" numbers on 601-1000** (section 1), so the next attempt has its
  baseline.

## 6. Decision for the owner

Nothing irreversible changed. `main` plays as before, and gains this report, the
GAPS and PROGRESS entries and the prompt's text in GO-NO-GO.

**Recommendation: do not make a third attempt at home investment. Build joint
projects (Phase 3) next.** The prompt 17 report named them: they create supply,
which is what this economy is short of (goods, not Credit), they are a Credit sink
that competes for the right reason, and they make collaboration the way to get
self-reliance, not an alternative to it. They also do not hand any nation a private
lever, so the nation-to-nation spread that sank this rule does not arise by
construction. Write the Phase 3 prompt with the trade-gain diagnostic (section 5)
and the card rule in view.

Two other options, neither recommended:

- **Restore the rule at c579cbc and accept the failed lines in writing.** It fails
  the pre-registered targets 1, 2(c) and 7 at every tried setting, and raises Saudi
  Arabia to 31-37% of games.
- **Keep trying knobs on home investment.** The 133 settings cover every tunable
  that moves the lever; a setting that works would need a new mechanism (for
  example a cap on the benefit of capacity that depends on the nation's shortage
  rank), which is a redesign and a new prompt, not a tune.

Prompt 18 (lane U) does not start: the rule was reverted, and its own text says so.

## 7. How to reproduce

```
# main today on the grading seeds (step 1)
npm run harness -- gate2 --games 200 --seed 601
npm run harness -- gate2 --games 200 --seed 801
# the attempt, at c579cbc (tune is a command only there)
git checkout c579cbc -- packages docs/RULES.md
npm run harness -- tune --games 200 --seed 1001 --set aiInvestTradeLossPct=0 --no-rates
npm run harness -- tune --games 200 --seed 1201 --set aiInvestPaybackPct=25,aiInvestTradeLossPct=100,investMaxPct=20,investCostBp=3000,defaultInvestBp=1000
```
