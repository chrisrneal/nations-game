import type { Tunable } from '@nations/contracts';

/**
 * Every balance number in the game, with the band it may move inside.
 *
 * Rules (see CLAUDE.md and docs/ROADMAP.md):
 * - No balance number lives anywhere else. Not inline, not in the UI, not in the AI.
 *   The AI reads them through `NationView.rules`, the same numbers every player sees.
 * - Each entry needs a `note` saying why the band is what it is.
 * - The balance harness may sweep inside [min, max]. Leaving the band is a
 *   design change and needs a decision record in docs/DECISIONS.md.
 * - Values are integers wherever they feed economy maths, so results are
 *   identical on every machine.
 *
 * Source: docs/RULES.md section 11, transcribed as written (prompt 06). Entries
 * marked "Prompt 06 gap-filler" are numbers the rules need but do not give;
 * each one is logged in docs/GAPS.md for lane D to ratify in RULES.md.
 */
export const TUNABLES = {
  // Engine limits
  maxCommandsPerNationPerTick: {
    value: 8,
    min: 1,
    max: 32,
    note: 'Caps one nation\'s intent per tick so a buggy or hostile client cannot flood a step; a real player needs a handful at most.',
  },
  crisisHistoryKept: {
    value: 12,
    min: 4,
    max: 24,
    note: 'Phase 2 prompt 09: locked crises kept in State and the View for crisis cards and recaps. Not balance: a 1,000-month stress run must not grow State without end.',
  },
  recapMaxLines: {
    value: 6,
    min: 3,
    max: 10,
    note: 'Phase 2 prompt 09: most lines an away recap shows. Six short sentences read in well under a minute (Gate 2 absence test).',
  },

  // Time and scale
  tickMonths: {
    value: 1,
    min: 1,
    max: 3,
    note: 'One world month per tick. Longer ticks mean fewer, heavier decisions and a harsher absence.',
  },
  gameLengthTicks: {
    value: 60,
    min: 24,
    max: 120,
    note: 'Five world years. Below 24 the climate ratchet never bites; above 120 a multiplayer game outlasts anyone\'s patience.',
  },
  outputScaleBp: {
    value: 833,
    min: 500,
    max: 1250,
    note: 'One twelfth of annual PPP GDP as monthly output. The band lets the harness compress or stretch the whole economy without touching anything else.',
  },

  // Food and energy
  foodDemandPerMillionPeople: {
    value: 1,
    min: 1,
    max: 3,
    note: 'One food unit feeds one million people for a month. Raising it makes food scarcer for everyone equally.',
  },
  energyDemandPerOutput: {
    value: 100,
    min: 60,
    max: 150,
    note: 'Energy demand as a percent of output. The band covers a world that electrifies fast and one that does not.',
  },
  selfSufficiencyPivot: {
    value: 50,
    min: 40,
    max: 60,
    note: 'The index value at which production equals demand. Moving it shifts the whole world into surplus or deficit.',
  },
  shortfallPenaltyBpPerPct: {
    value: 20,
    min: 10,
    max: 120,
    note: 'Output cost per percent of unmet demand. At 20, a 10% shortfall costs 2% of output, and food and energy fully unmet together cost 40%. Prompt 09 gate1 tuning: 40 -> 35; decision record H3: 35 -> 20 with the cap at 60, so no nation sits in a dead zone where the next unit of cover is worth nothing.',
  },
  structuralCoverSharePct: {
    value: 80,
    min: 50,
    max: 100,
    note: 'Share of the world\'s structural surplus counted as reachable when setting each importer\'s fair share and its baseline (RULES 2.8). 100 assumes every spare unit reaches a buyer; lower allows for goods that never reach market (regions answer offers but never make them). Prompt 09 gate1 tuning (seeds 1001-1400 only): 80.',
  },
  maxShortfallPenaltyPct: {
    value: 60,
    min: 10,
    max: 60,
    note: 'Cap on the shortfall penalty (food and energy together), so no nation is killed by one bad tick (Gate 1: dead states under 2%). Decision record H3: 30 -> 60, out of reach at 20 bp per percent (both goods fully unmet is 40%), so it is a safety net, not a plateau.',
  },
  mineralsEnergyBonusBpPer10: {
    value: 10,
    min: 0,
    max: 40,
    note: 'Energy production bonus per 10 points of mineral endowment (+1% at 100 at the starting value; RULES prose says +10%, see docs/GAPS.md).',
  },
  mineralsOutputBonusBpPer10: {
    value: 10,
    min: 0,
    max: 40,
    note: 'Output bonus per 10 points of refining leverage. Set both to 0 to test a world where minerals do not matter.',
  },

  // Resilience
  resilienceStartWeightPreparedness: {
    value: 50,
    min: 0,
    max: 100,
    note: 'Percent weight on pandemic preparedness versus inverse climate exposure in the starting level. 50 is a plain average.',
  },
  resilienceDecayPerTick: {
    value: 1,
    min: 0,
    max: 3,
    note: 'Points lost per tick if unfunded, so neglect is a choice. At 0 resilience becomes a one-time purchase.',
  },
  resilienceCostPerPoint: {
    value: 6,
    min: 2,
    max: 20,
    note: 'Credit cost of one resilience point. The band decides whether resilience competes with trade for money.',
  },
  resilienceMax: {
    value: 100,
    min: 80,
    max: 120,
    note: 'Ceiling. Above 100 a nation can over-prepare, which the harness may want to test.',
  },
  defaultResilienceFloor: {
    value: 40,
    min: 0,
    max: 80,
    note: 'Prompt 06 gap-filler: the resilience-floor dial\'s starting position (RULES 8.2 names the dial, not its default). 0 turns automatic funding off.',
  },

  // Trade
  offerLifeTicks: {
    value: 3,
    min: 1,
    max: 12,
    note: 'Three world months to answer. Short enough to keep the board moving, long enough for an absent player\'s policies to catch it (S8).',
  },
  maxOpenOffersPerNation: {
    value: 6,
    min: 2,
    max: 20,
    note: 'Caps spam from AI and spreadsheet play from humans.',
  },
  priceBandPct: {
    value: 35,
    min: 10,
    max: 60,
    note: 'Width of the fair-price band either side of the reference price. Narrow bands make hard bargains common and trust volatile.',
  },
  gainsFromTradeBp: {
    value: 40,
    min: 5,
    max: 40,
    note: 'Monthly output bonus for a nation whose trades clear its whole imbalance: all of its surplus, and its fair share of each deficit (RULES 3.3). Each side gains by the share of its own imbalance cleared, capped at this rate a month. This is the number Gate 1\'s 15% trade advantage is tuned with. Prompt 06: 15 -> 40; prompt 09 re-checked on seeds 1001-1400 under the new rule: 40.',
  },
  autoAcceptTrustThreshold: {
    value: 55,
    min: 30,
    max: 80,
    note: 'Trust level at which the trusted-partner standing policy fires.',
  },
  foodBasePriceMilli: {
    value: 100,
    min: 20,
    max: 500,
    note: 'Prompt 06 gap-filler: reference price of one food unit in thousandths of a Credit when world supply meets demand. 100 puts world food spending near 4% of output.',
  },
  energyBasePriceMilli: {
    value: 60,
    min: 10,
    max: 300,
    note: 'Prompt 06 gap-filler: reference price of one energy unit in thousandths of a Credit at balance. 60 puts world energy spending near 6% of output.',
  },
  startingStockTicks: {
    value: 1,
    min: 0,
    max: 6,
    note: 'Prompt 06 gap-filler: starting Food and Energy as ticks of own production, and starting Credit as ticks of output. Above 0 so nobody starts a game already short.',
  },

  // Trust
  baseTrust: {
    value: 35,
    min: 20,
    max: 50,
    note: 'Trust between two nations with no ties at all, and the level trust drifts back to.',
  },
  trustSharedAlliance: {
    value: 25,
    min: 10,
    max: 40,
    note: 'Bonus for any defence alliance in common. The largest single term, because it is the strongest real-world tie.',
  },
  trustSharedBlocEach: {
    value: 10,
    min: 3,
    max: 20,
    note: 'Bonus per trade bloc in common.',
  },
  trustSharedBlocCap: {
    value: 25,
    min: 10,
    max: 50,
    note: 'Cap on the bloc bonus, so a nation in six groupings does not start trusting everyone.',
  },
  trustTradePartner: {
    value: 12,
    min: 5,
    max: 25,
    note: 'Bonus per direction when one nation is among the other\'s top three partners.',
  },
  trustBothG20: {
    value: 5,
    min: 0,
    max: 15,
    note: 'Small bonus for both sitting in the G20, a proxy for "they talk regularly".',
  },
  trustNoTiesPenalty: {
    value: 10,
    min: 0,
    max: 25,
    note: 'Penalty when two nations share no bloc and no trade tie.',
  },
  trustMin: {
    value: 5,
    min: 0,
    max: 20,
    note: 'Floor. Above 0 so a relationship is never unrecoverable.',
  },
  trustMax: {
    value: 90,
    min: 70,
    max: 100,
    note: 'Ceiling. Below 100 so no relationship is unbreakable.',
  },
  trustPerTrade: {
    value: 2,
    min: 1,
    max: 5,
    note: 'Gained per completed trade.',
  },
  trustPerIgnoredOffer: {
    value: 1,
    min: 0,
    max: 3,
    note: 'Lost when an offer is left to expire. Ignoring is an answer.',
  },
  trustPerRenege: {
    value: 12,
    min: 5,
    max: 30,
    note: 'Lost for accepting and then failing to deliver. Six trades to repair at the starting values.',
  },
  trustDecayPerTick: {
    value: 1,
    min: 0,
    max: 3,
    note: 'Drift back towards baseTrust, so memory fades (the roadmap\'s decaying belief).',
  },
  trustPerPledgeHonoured: {
    value: 2,
    min: 0,
    max: 6,
    note: 'Phase 2 prompt 09: trust every other nation gains in a pledger who pays in full by the deadline (RULES 4.4). Small, like a completed trade, because keeping a promise is expected.',
  },
  trustPerPledgeBroken: {
    value: 12,
    min: 5,
    max: 30,
    note: 'Phase 2 prompt 09: trust every other nation loses in a pledger who withdraws or cannot pay (RULES 4.4). Matches trustPerRenege: six kept pledges repair one broken.',
  },

  // Climate (Phase 2)
  climateEventIntervalTicks: {
    value: 12,
    min: 6,
    max: 24,
    note: 'One climate event per world year.',
  },
  climateBaseSeverity: {
    value: 20,
    min: 10,
    max: 40,
    note: 'Severity of the first event.',
  },
  climateRampPerYear: {
    value: 8,
    min: 0,
    max: 20,
    note: 'Added severity per world year, which is what makes climate a ratchet rather than weather. At 0 it stops ratcheting.',
  },
  climateDamageSpreadTicks: {
    value: 6,
    min: 1,
    max: 12,
    note: 'Ticks over which damage is felt. Six months is what makes climate the slow crisis.',
  },
  climateFirstOpenTick: {
    value: 3,
    min: 0,
    max: 11,
    note: 'Phase 2 prompt 09: month of each world year in which the climate appeal opens (tick modulo climateEventIntervalTicks). 3 lets the last event of a 60-month game lock and land inside the game.',
  },
  crisisResponseTicks: {
    value: 3,
    min: 1,
    max: 6,
    note: 'Phase 2 prompt 09: months from a climate appeal opening to its pool locking. Long enough for an absent player\'s policy to answer; short enough that the appeal is news.',
  },

  // Pandemic (Phase 2)
  pandemicChanceBpPerTick: {
    value: 167,
    min: 83,
    max: 417,
    note: 'About one in 60 ticks, so roughly one pandemic per game. The band spans one per two games to two and a half per game.',
  },
  pandemicWindowTicks: {
    value: 3,
    min: 2,
    max: 6,
    note: 'Ticks from trigger to resolution. Three months is what makes it the fast crisis.',
  },
  pandemicBaseSeverity: {
    value: 35,
    min: 15,
    max: 60,
    note: 'Damage scale before preparedness and pool cover.',
  },
  lateContributionEffectPct: {
    value: 40,
    min: 0,
    max: 70,
    note: 'Effectiveness of money paid in after the trigger. Below 100 is the whole point: a pandemic rewards having funded the pool already.',
  },

  // Crisis pools (Phase 2)
  poolCoverMaxPct: {
    value: 80,
    min: 50,
    max: 95,
    note: 'Maximum damage a full pool can prevent. Never 100, so resilience and trade still matter.',
  },
  poolTargetScaleBp: {
    value: 1000,
    min: 500,
    max: 2000,
    note: 'Scales how much Credit a full pool needs relative to world exposure and output. The main lever on Gate 2\'s 40-75% crisis success band.',
  },
  contributorResilienceBonus: {
    value: 3,
    min: 0,
    max: 10,
    note: 'Resilience given to contributors only, so cooperating pays something private.',
  },
  contributorTrustBonus: {
    value: 2,
    min: 0,
    max: 6,
    note: 'Trust gained with every other contributor.',
  },
  crisisPartialPct: {
    value: 50,
    min: 25,
    max: 90,
    note: 'Phase 2 prompt 09: share of the target, in percent, a pool must reach for a crisis to count as a partial success rather than a failure. Reaching the whole target is a success (RULES 4.3).',
  },
  contributorMinSharePct: {
    value: 50,
    min: 10,
    max: 100,
    note: 'Phase 2 prompt 09: share of its own fair share a nation must pay in a round to count as a contributor for the bonuses, so one token Credit cannot farm them.',
  },
  nonPayerCoverPct: {
    value: 50,
    min: 0,
    max: 100,
    note: 'Prompt 14: percent of the pool\'s cover that reaches a nation that paid none of its own share; the cover scales in a straight line up to all of it at a full share (RULES 4.3 rule 1). 100 is the old rule, where paying was optional and free-riding cost nothing (GATE-2 F3). Tuning (seeds 1001-1400 only): 100 (old rule) -> 50. 75 leaves the free-rider at 1.61x fair share; 25 and 0 only push the cooperator\'s share of tops higher.',
  },
  defaultContributionBp: {
    value: 110,
    min: 0,
    max: 200,
    note: 'Phase 2 prompt 09: starting position of the monthly contribution dial (RULES 8.2 dial 3), in basis points of income, split between the pools. Steady funding is what fills the health pool before a pandemic. Phase 2 prompt 09 gate2 tuning (seeds 1001-1100 only): 20 -> 110, the main lever on crisis success.',
  },
  reciprocalMatchPct: {
    value: 50,
    min: 25,
    max: 100,
    note: 'Phase 2 prompt 09: how much of its target the world must have met in a pool\'s last round, in percent, for a reciprocal policy to pay its full share this round. Below it, it pays in proportion.',
  },
  maxPledgeTicks: {
    value: 12,
    min: 3,
    max: 24,
    note: 'Phase 2 prompt 09: furthest ahead a pledge deadline may be set. A year: long enough to promise for the next climate event, short enough that a promise is soon tested.',
  },

  // Scoring
  collectiveFloorBp: {
    value: 7000,
    min: 5000,
    max: 9000,
    note: 'Multiplier when the world achieves nothing (0.70). Must stay above zero - see RULES section 5.3.',
  },
  collectiveCeilingBp: {
    value: 14000,
    min: 11000,
    max: 20000,
    note: 'Multiplier when the world achieves everything (1.40). The gap to the floor is how much cooperation is worth.',
  },
  baselineToleranceBp: {
    value: 9500,
    min: 9000,
    max: 9900,
    note: '`ownScore` counted as "at baseline" for the collective goal (0.95).',
  },
  scoreScale: {
    value: 1000,
    min: 100,
    max: 10000,
    note: 'Cosmetic multiplier so final scores read as four digits.',
  },
  scoreSmoothingTicks: {
    value: 12,
    min: 1,
    max: 24,
    note: 'Window of the exponential average ownScore is read from (RULES 5.1): each month moves the score 1/12 of the way. 1 is the old last-month reading, which let one lucky or unlucky final month decide a game. Prompt 09 gate1 tuning (seeds 1001-1400 only): 12.',
  },

  // AI
  aiGoalRescoreTicks: {
    value: 3,
    min: 1,
    max: 12,
    note: 'How often an AI re-scores its goals. Staggered across nations to stay inside the per-tick compute budget.',
  },
  aiNoiseBp: {
    value: 300,
    min: 0,
    max: 1000,
    note: 'Random jitter on action scores, so the AI is legible but not farmable. At 0 it is perfectly predictable.',
  },
  aiReciprocityAllianceThreshold: {
    value: 40,
    min: 20,
    max: 60,
    note: 'Alliance density at or above which an AI is strictly reciprocal.',
  },
  aiForgivingImportThreshold: {
    value: 60,
    min: 40,
    max: 80,
    note: 'Import dependence at or above which an AI forgives.',
  },
  aiExploiterExportThreshold: {
    value: 30,
    min: 10,
    max: 50,
    note: 'Export concentration at or above which an AI will bargain hard.',
  },
  aiExploiterImportCeiling: {
    value: 40,
    min: 20,
    max: 60,
    note: 'Import dependence below which hard bargaining is safe for it.',
  },
  aiStockBufferTicks: {
    value: 2,
    min: 1,
    max: 6,
    note: 'Prompt 06 gap-filler: ticks of own demand the greedy trader keeps in stock before it sells a surplus or stops buying. Higher is safer and trades less.',
  },
  // AI nations (prompt 10, docs/AI_DESIGN.md). Read by packages/ai through NationView.rules.
  aiRetaliationWindowTicks: {
    value: 2,
    min: 1,
    max: 6,
    note: 'Latest tick, counted from a broken deal, by which a strict reciprocator has visibly retaliated. Short is legible (players connect cause and effect); long feels arbitrary.',
  },
  aiPunishTicks: {
    value: 6,
    min: 2,
    max: 24,
    note: 'How long a retaliation lasts: months of refused trade after a broken deal (half that after a skipped crisis pledge). Long enough to cost more than the break gained, short enough that a reformed partner returns.',
  },
  aiForgiveLimit: {
    value: 1,
    min: 0,
    max: 3,
    note: 'Offences a forgiving AI lets pass inside its memory before it retaliates like a strict one. 0 makes forgiving the same as strict; above 1 becomes farmable.',
  },
  aiMemoryDecayPct: {
    value: 4,
    min: 1,
    max: 20,
    note: 'Percent of remembered grievance that fades each tick (the roadmap\'s decaying memory). 4 halves a grudge in about 17 months; 20 forgets within a season.',
  },
  aiGrudgePerBreak: {
    value: 40,
    min: 10,
    max: 100,
    note: 'Grievance points for a deal broken against this nation. Grievance at or above this counts as an unforgiven offence and lowers the partner in every ranking.',
  },
  aiGrudgePerSkip: {
    value: 20,
    min: 0,
    max: 60,
    note: 'Grievance points for skipping a crisis pledge this nation paid into. 0 means crisis free-riding is never remembered in trade.',
  },
  aiTrustPriceBpPerPoint: {
    value: 20,
    min: 0,
    max: 60,
    note: 'How much more generous (bp of price) an AI is per point of trust above baseTrust, and how much stricter below. At 20, trust 75 accepts 8% worse terms; trust 15 wants 4% better.',
  },
  aiCounterRangePct: {
    value: 20,
    min: 0,
    max: 40,
    note: 'How far below its reservation price an offer can be and still get a counter rather than a flat rejection. 0 turns counters off.',
  },
  aiExploiterMarkupPct: {
    value: 0,
    min: 0,
    max: 50,
    note: 'Markup a hard-bargaining AI asks over the reference price. At or below priceBandPct its offers stay fair; above it they are hard bargains. Prompt 10 AI gate2 tuning (seeds 1001-1400 only): 20 -> 0, because every markup let the exporters that sell first top more games; hard bargainers still differ by whom they favour, surcharges on offenders and pool free-riding.',
  },
  aiBudgetUnitsPerTick: {
    value: 4000,
    min: 500,
    max: 20000,
    note: 'Work units the whole AI roster may spend per tick (one unit is one candidate scored). Due nations that do not fit wait a tick. 4000 fits the 17-nation roster with room; measured in docs/AI_DESIGN.md.',
  },
  aiPledgeMaxIncomePct: {
    value: 10,
    min: 0,
    max: 30,
    note: 'Most of one month\'s income an AI pledges to a crisis pool in one go. Caps how far generosity can starve its own economy.',
  },
  aiConditionalPledgePct: {
    value: 50,
    min: 20,
    max: 80,
    note: 'A strict reciprocator pledges its full fair share only when at least this percent of nations paid into the last crisis. Lower cooperates more readily.',
  },
  aiFreeRideCoverPct: {
    value: 70,
    min: 40,
    max: 100,
    note: 'A hard bargainer skips a pledge once the pool is this percent funded. Its monthly contribution still pays part of its share, which is what keeps its cover (RULES 4.3 rule 1). 100 means it never free-rides.',
  },

  // Joint projects (RULES 13, decision record H4)
  projectFormingTicks: {
    value: 3,
    min: 1,
    max: 6,
    note: 'Months an invitation stays open (RULES 13.2). Long enough for an absent invitee\'s next check-in, short enough that a host can try again.',
  },
  projectMinMembers: {
    value: 3,
    min: 2,
    max: 5,
    note: 'Members, host included, needed to start building at the forming deadline. Below 3 a project is a bilateral deal, which trade already covers.',
  },
  projectSlots: {
    value: 4,
    min: 3,
    max: 6,
    note: 'Most members, host included. Scarce seats are what make a host\'s invitation worth having.',
  },
  projectBuildTicks: {
    value: 9,
    min: 4,
    max: 18,
    note: 'Build months at a template\'s 100%. Long enough that joining late does not pay back inside a 60-month game.',
  },
  projectYieldPct: {
    value: 40,
    min: 10,
    max: 80,
    note: 'Total yield as a percent of the host\'s surplus in that good at founding, at a template\'s 100%. The world is short of goods; this is how much a project adds.',
  },
  projectMinSurplusPct: {
    value: 10,
    min: 0,
    max: 50,
    note: 'Surplus, as a percent of the host\'s own demand, needed to host a goods project. Keeps balanced economies from hosting a plant for a good they barely make.',
  },
  projectFoodUnitCost: {
    value: 10,
    min: 4,
    max: 60,
    note: 'Credit per unit of monthly food yield. A unit of food a rich importer goes short of costs it about 0.8 Credit of output a month, one it would have bought about 0.1, so a food project pays back in one to three years depending on how short the buyer really is.',
  },
  projectEnergyUnitCost: {
    value: 3,
    min: 1,
    max: 20,
    note: 'Credit per unit of monthly energy yield. At 20 bp per percent of shortfall a unit of energy an importer goes short of saves it about 0.15 Credit of output a month, so about 20 months to pay back when the shortage is real, and never when trade already covers it.',
  },
  projectShieldCostPct: {
    value: 20,
    min: 5,
    max: 100,
    note: 'A shield member\'s total due as a percent of its own monthly output, at a template\'s 100%. A shield\'s benefit scales with the member\'s output, so its price does too. 100x slice 9 (seeds 1001-1060): at 10 the early-warning network was built in 80% of games, a default rather than a choice; at 20 it is built in 20% and no template in more than 45% (Gate 3: at most 50%). It now pays only for the more exposed nations.',
  },

  projectShieldBp: {
    value: 2500,
    min: 1000,
    max: 5000,
    note: 'Crisis damage a shield cuts for its members, after pool cover. Below 5000 so the pools still matter.',
  },
  projectMaxHosted: {
    value: 2,
    min: 1,
    max: 4,
    note: 'Projects one nation may host that start building, per game. Spreads hosting across the surplus nations.',
  },
  projectTrustBuilt: {
    value: 4,
    min: 0,
    max: 10,
    note: 'Trust every pair of members gains when a project completes. Two trades\' worth: building together is a stronger tie.',
  },
  projectTrustLeave: {
    value: 12,
    min: 5,
    max: 30,
    note: 'Trust each remaining member loses in a nation that leaves mid-build. Matches a broken pledge.',
  },
  aiProjectMinTrust: {
    value: 30,
    min: 0,
    max: 60,
    note: 'Mean trust in a project\'s host and members below which an AI will not join: partners it does not trust may walk out mid-build and leave it paying longer (RULES 13.3).',
  },
  aiProjectMinYield: {
    value: 40,
    min: 0,
    max: 200,
    note: 'Smallest monthly yield an AI host bothers to found a goods project for: below it the partners\' share is too small to be worth a consortium.',
  },
  autoImportOffersPerGood: {
    value: 2,
    min: 1,
    max: 4,
    note: 'Most offers the "keep us supplied" policy sends for one good in a month (RULES 3.4). Two lets it split a shortfall between the two most trusted sellers without flooding the board.',
  },
  worldAccordBp: {
    value: 8500,
    min: 5000,
    max: 9500,
    note: 'The World Accord (RULES 5.4): the shared goals must average at least this at the end for the world to have made it. All-AI worlds end at 83-92%, worlds with defectors at 59-80% (100x slice 7 measurement), so a player\'s own choices decide it at the margin. Presentation only: it never changes a score (D3).',
  },
} as const satisfies Readonly<Record<string, Tunable>>;

export type TunableId = keyof typeof TUNABLES;

/** The numeric value of every tunable, as the rules every player sees. */
export type RuleValues = { readonly [K in TunableId]: number };
