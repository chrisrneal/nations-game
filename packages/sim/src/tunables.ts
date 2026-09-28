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
    value: 35,
    min: 10,
    max: 120,
    note: 'Output cost per percent of unmet demand. At 35, a 10% shortfall costs 3.5% of output. Prompt 09 gate1 tuning (seeds 1001-1400 only): 40 -> 35.',
  },
  structuralCoverSharePct: {
    value: 80,
    min: 50,
    max: 100,
    note: 'Share of the world\'s structural surplus counted as reachable when setting each importer\'s fair share and its baseline (RULES 2.8). 100 assumes every spare unit reaches a buyer; lower allows for goods that never reach market (regions answer offers but never make them). Prompt 09 gate1 tuning (seeds 1001-1400 only): 80.',
  },
  maxShortfallPenaltyPct: {
    value: 30,
    min: 10,
    max: 60,
    note: 'Cap on the shortfall penalty (food and energy together), so no nation is killed by one bad tick (Gate 1: dead states under 2%).',
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
} as const satisfies Readonly<Record<string, Tunable>>;

export type TunableId = keyof typeof TUNABLES;

/** The numeric value of every tunable, as the rules every player sees. */
export type RuleValues = { readonly [K in TunableId]: number };
