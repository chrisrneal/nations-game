# Balance report: 100x slice 4, the AI builds joint projects

2026-09-30. The shipped AI now founds, joins, declines and leaves joint projects
(RULES 13, docs/AI_DESIGN.md 6a). Rule changes in the same slice: unit costs
lowered inside their bands (food 18 -> 10, energy 5 -> 3; energy is worth about
0.14 Credit a unit to an importer because its demand exceeds its realised output),
a nation may be in one shield of each kind, invitations are limited to the free
seats (so a project is never oversubscribed and every invitation is a seat), and
grid-link invitations must share a bloc or alliance with the host. Two new AI
tunables: `aiProjectMinTrust` 30, `aiProjectMinYield` 40.

Measured with the gate2 suite on seeds 1001-1100 against slice 2's run (same seeds),
and with 6 all-AI games for the project lines.

| Line | Slice 2 | Slice 4 |
|---|---|---|
| AI vs idle: overall | +14.5% | **+17.5%** |
| AI vs idle: Japan / Korea / Mexico / Turkiye | +16.9 / +13.6 / +4.1 / +6.1% | **+33.3 / +20.7 / +14.8 / +12.5%** |
| AI vs idle: Germany (the other deep importer) | +3.8% | +9.2% |
| Trading vs isolating (Gate 1, at least +15%) | +17.4% | **+18.6%** |
| Crisis success (40-75%) | 60.8% | 61.1% |
| Cooperator vs free-rider median gap | +6.82% | +6.14% |
| Free-rider tops / fair share | 1.09x | 0.95x |
| Stealth sabotage paid (pairs) | 2.0% | 1.0% |
| Most frequent top scorer, archetype games (waived) | Saudi Arabia 22.0% | Saudi Arabia 22.0% |
| Most frequent top scorer, Gate 1 mix (waived) | Canada 14.0% | Canada 15.0% |
| Japan's share of tops, archetype games | 0.0% | 2.0% |
| Crashes, negative stocks, dead states | 0, 0, 0 | 0, 0, 0 |

Project lines, 6 all-AI games (seeds 1-6):

| Line | Result |
|---|---|
| Projects completed per game | 14 |
| Templates built | all seven (hydrogen x5-6, grid x3, early-warning x3, grain, irrigation) |
| Proposals / joins / declines / lapses per game | 67 / 54 / 260 / 53 |
| Members who left mid-build | 0 |
| Project sink / Credit income | about 0.6% |

**Reading.** Joint projects do what H4 set out to do: they are the lever the deep
importers never had. For the first time every nation gains 9% or more from good
play, and collaboration pulls further ahead of isolation. The top-scorer line does
not move. The AI declines most invitations (a real choice: a project is worth it
only to a nation that is really short, early enough to pay back), and about half of
proposals lapse.

**Risks, reported under H2.** (1) In all-AI games Japan's median rank when played
is 1st of 17 in the AI-vs-idle pairs: projects may now make Japan the nation to beat
in a world of AIs. (2) Nobody ever leaves a project: withdrawal is priced but the
numbers rarely say go, so Gate 3's "withdrawal sometimes rational" is not yet shown.
(3) The project sink is small (0.6% of income): Credit is still abundant after the
first year; projects compete for value and seats more than for money. (4) All-AI
games build nearly the same projects every seed (the AI is deterministic and
project choice depends on structure), so Gate 3's "no project built in over 50% of
games" would fail as written; the harness now reports it.
