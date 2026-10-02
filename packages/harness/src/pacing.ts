/**
 * The pacing pass (RULES 11): two bots play the airport and the harness times
 * every milestone against the targets.
 *
 * - The greedy bot plays actively: it taps three times a second (the gate with
 *   the least rush banked), looks at its upgrades once a second, buys the best
 *   value (income gained per dollar, looking one purchase ahead so that
 *   upgrades which only pay together still get bought), and sells the airport
 *   once the next slot is further away than half the time this airport has run.
 * - The idle bot never taps. It checks in every 15 minutes, spends what it can
 *   with the same picker, and sells at the first check-in where the sale is
 *   worth at least half again in fares (no waiting for the airport to slow).
 * - Both use every boost that is ready (RULES 15): the greedy bot as soon as
 *   it is, the idle bot as it leaves each check-in, so it runs while away.
 *
 * Both use the sim's own income estimate (P6) to value upgrades. Runs in Node.
 */
import type { AirportCommand, AirportState, UpgradeId } from '@airport/contracts';
import {
  AIRPORT_TUNABLES,
  BOOST_IDS,
  READY_BOOSTS,
  UPGRADE_IDS,
  advanceMany,
  airportView,
  boostProblem,
  earnedForSlots,
  estimate,
  slotsFor,
  stepAirport,
  createAirport,
  upgradeCost,
  lockReason,
  maxLevel,
} from '@airport/sim';

const TICKS_PER_SEC = 1000 / AIRPORT_TUNABLES.tickMs.value;

/** Upgrades that earn: the night shift only matters when away, so bots value it separately. */
const EARNING: readonly UpgradeId[] = UPGRADE_IDS.filter((id) => id !== 'night');

function canBuy(state: AirportState, id: UpgradeId): boolean {
  return lockReason(id, state) === null && state.levels[id] < maxLevel(id, state);
}

function withLevel(state: AirportState, id: UpgradeId): AirportState {
  return { ...state, levels: { ...state.levels, [id]: state.levels[id] + 1 } };
}

/**
 * The upgrade the greedy picker wants next: the best income gained per cent
 * spent, where a purchase may also be valued together with the best one after
 * it (a route needs a plane; gates need passengers). Null if nothing earns.
 */
export function bestUpgrade(state: AirportState): UpgradeId | null {
  const base = estimate(state).incomePerSec;
  let best: UpgradeId | null = null;
  let bestValue = 0;
  for (const a of EARNING) {
    if (!canBuy(state, a)) continue;
    const costA = upgradeCost(a, state.levels[a]);
    const afterA = withLevel(state, a);
    let value = (estimate(afterA).incomePerSec - base) / costA;
    for (const b of EARNING) {
      if (!canBuy(afterA, b)) continue;
      const pair = (estimate(withLevel(afterA, b)).incomePerSec - base) / (costA + upgradeCost(b, afterA.levels[b]));
      if (pair > value) value = pair;
    }
    if (value > bestValue) {
      bestValue = value;
      best = a;
    }
  }
  if (best !== null) return best;
  // Nothing raises the estimate on its own or in a pair: buy the cheapest thing that earns.
  let cheapest: UpgradeId | null = null;
  for (const id of EARNING) if (canBuy(state, id) && (cheapest === null || upgradeCost(id, state.levels[id]) < upgradeCost(cheapest, state.levels[cheapest]))) cheapest = id;
  return cheapest;
}

/** The night shift is worth buying once it costs less than this many seconds of income. */
const NIGHT_PAYBACK_SEC = 300;

function wantsNight(state: AirportState): boolean {
  if (!canBuy(state, 'night')) return false;
  return upgradeCost('night', state.levels.night) <= estimate(state).incomePerSec * NIGHT_PAYBACK_SEC;
}

/**
 * Sell once the sale would raise fares by at least half again (the slots it
 * adds are at least half the slots owned, and at least `minFirstSlots` the
 * first time), and the next slot is further away than a quarter of the time
 * this airport has run: the airport is slowing down.
 */
export function wantsToSell(state: AirportState, runTicks: number, minFirstSlots = 3, patient = true): boolean {
  const claimable = slotsFor(state.run.earned);
  const bonus = AIRPORT_TUNABLES.slotBonusBp.value;
  const now = 10_000 + state.slots * bonus;
  const after = now + claimable * bonus;
  if (claimable < 1 || after * 2 < now * 3 || claimable < (state.slots === 0 ? minFirstSlots : 1)) return false;
  if (!patient) return true;
  const income = estimate(state).incomePerSec;
  if (income <= 0) return true;
  const toNext = (earnedForSlots(claimable + 1) - state.run.earned) / income;
  return toNext > runTicks / TICKS_PER_SEC / 4;
}

export interface Milestone {
  readonly what: string;
  /** Seconds from the first airport opening. */
  readonly at: number;
  /** A new thing to have reached: a gate, a plane, a route, a sale. */
  readonly novel: boolean;
}

export interface BotRun {
  readonly bot: 'greedy' | 'idle';
  readonly milestones: readonly Milestone[];
  /** Seconds to the first purchase, the second gate, the first slot on offer, the first sale (null: not within the run). */
  readonly firstUpgrade: number | null;
  readonly firstGate: number | null;
  readonly firstSlot: number | null;
  readonly firstSale: number | null;
  readonly slotsAtFirstSale: number | null;
  /** Longest wait between new things before the first sale, seconds. */
  readonly longestGap: number;
  readonly final: AirportState;
  /** States at fixed minutes, for the active-versus-idle comparison. */
  readonly snapshots: readonly { readonly minute: number; readonly state: AirportState }[];
  /** Idle bot only: share of check-ins that bought at least one upgrade. */
  readonly checkInsWithPurchase: number | null;
  /** Idle bot only: the airport after each check-in's purchases. */
  readonly checkIns: readonly AirportState[];
}

export interface PacingOptions {
  readonly seed?: number;
  /** False keeps the first airport forever (for tuning the content curve). */
  readonly sell?: boolean;
  /** Start from this airport instead of a new one (the 5-minute session check). */
  readonly from?: AirportState;
  readonly minutes?: number;
  readonly snapshotMinutes?: readonly number[];
  /** False: the bots never use boosts (to see what boosts are worth). */
  readonly boosts?: boolean;
}

const LEVEL_NAMES: Partial<Record<UpgradeId, string>> = { gates: 'gate', plane: 'plane', route: 'route' };

function recorder(): {
  milestones: Milestone[];
  note: (what: string, tick: number, novel: boolean) => void;
} {
  const milestones: Milestone[] = [];
  return { milestones, note: (what, tick, novel) => milestones.push({ what, at: tick / TICKS_PER_SEC, novel }) };
}

function summarise(
  bot: 'greedy' | 'idle',
  milestones: Milestone[],
  final: AirportState,
  snapshots: { minute: number; state: AirportState }[],
  checkIns: number | null,
  checkInStates: AirportState[] = [],
): BotRun {
  const find = (what: string): Milestone | undefined => milestones.find((m) => m.what === what);
  const sale = find('sale 1');
  const until = sale?.at ?? Number.POSITIVE_INFINITY;
  let longestGap = 0;
  let last = 0;
  for (const m of milestones) {
    if (!m.novel || m.at > until) continue;
    longestGap = Math.max(longestGap, m.at - last);
    last = m.at;
  }
  return {
    bot,
    milestones,
    firstUpgrade: milestones.find((m) => m.what.startsWith('bought'))?.at ?? null,
    firstGate: find('gate 2')?.at ?? null,
    firstSlot: find('slot on offer')?.at ?? null,
    firstSale: sale?.at ?? null,
    slotsAtFirstSale: sale === undefined ? null : Number(/\((\d+) slots\)/.exec(milestones.find((m) => m.what.startsWith('sold'))?.what ?? '')?.[1] ?? NaN),
    longestGap,
    final,
    snapshots,
    checkInsWithPurchase: checkIns,
    checkIns: checkInStates,
  };
}

/** Applies one purchase or sale and records it. Returns the new state. */
function act(state: AirportState, command: 'sell' | UpgradeId, note: (what: string, tick: number, novel: boolean) => void, sales: { n: number }): AirportState {
  const tick = state.tick;
  if (command === 'sell') {
    const slots = slotsFor(state.run.earned);
    const next = stepAirport(state, [{ tick, type: 'sell', payload: {} }]).state;
    sales.n += 1;
    note(`sold (${slots} slots)`, tick, false);
    note(`sale ${sales.n}`, tick, true);
    return next;
  }
  const next = stepAirport(state, [{ tick, type: 'buy', payload: { upgrade: command } }]).state;
  if (next.levels[command] === state.levels[command]) return next;
  note(`bought ${command} ${next.levels[command]}`, tick, false);
  const kind = LEVEL_NAMES[command];
  if (kind !== undefined) note(`${kind} ${command === 'gates' ? next.levels.gates + 1 : next.levels[command]}`, tick, true);
  return next;
}

/** Every boost that is ready now (RULES 15). */
function boosts(state: AirportState): AirportCommand[] {
  return BOOST_IDS.filter((id) => boostProblem(id, state) === null).map((boost) => ({ tick: state.tick, type: 'boost' as const, payload: { boost } }));
}

/** The airport with no boost running or recharging: income comparisons measure taps and levels alone. */
export function unboosted(state: AirportState): AirportState {
  return { ...state, boosts: READY_BOOSTS };
}

/** Taps for this tick: three a second, each to the gate with the least rush banked. */
function taps(state: AirportState): { tick: number; type: 'tap'; payload: { gate: number } }[] {
  if (state.tick % 4 === 0) return [];
  let gate = 0;
  for (let i = 1; i < state.gates.length; i++) if ((state.gates[i]?.rush ?? 0) < (state.gates[gate]?.rush ?? 0)) gate = i;
  return [{ tick: state.tick, type: 'tap', payload: { gate } }];
}

export function runGreedy(options: PacingOptions = {}): BotRun {
  const minutes = options.minutes ?? 90;
  const snapshotAt = new Set((options.snapshotMinutes ?? [2, 10, 30, 60]).map((m) => m * 60 * TICKS_PER_SEC));
  const { milestones, note } = recorder();
  const sales = { n: 0 };
  let state = options.from ?? createAirport({ seed: options.seed ?? 1 });
  let runStart = 0;
  let offered = false;
  const snapshots: { minute: number; state: AirportState }[] = [];
  const end = state.tick + minutes * 60 * TICKS_PER_SEC;
  while (state.tick < end) {
    if (snapshotAt.has(state.tick)) snapshots.push({ minute: state.tick / TICKS_PER_SEC / 60, state });
    if (state.tick % TICKS_PER_SEC === 0) {
      for (let guard = 0; guard < 20; guard++) {
        if (options.sell !== false && wantsToSell(state, state.tick - runStart)) {
          state = act(state, 'sell', note, sales);
          runStart = state.tick;
          offered = false;
          break;
        }
        const pick = wantsNight(state) ? 'night' : bestUpgrade(state);
        if (pick === null || upgradeCost(pick, state.levels[pick]) > state.cash) break;
        state = act(state, pick, note, sales);
      }
      if (!offered && slotsFor(state.run.earned) >= 1) {
        offered = true;
        if (sales.n === 0) note('slot on offer', state.tick, false);
      }
    }
    state = stepAirport(state, [...(options.boosts === false ? [] : boosts(state)), ...taps(state)]).state;
  }
  return summarise('greedy', milestones, state, snapshots, null);
}

export function runIdle(options: PacingOptions & { readonly checkInMinutes?: number } = {}): BotRun {
  const minutes = options.minutes ?? 180;
  const every = (options.checkInMinutes ?? 15) * 60 * TICKS_PER_SEC;
  const { milestones, note } = recorder();
  const sales = { n: 0 };
  let state = createAirport({ seed: options.seed ?? 1 });
  let runStart = 0;
  let checkIns = 0;
  let withPurchase = 0;
  const states: AirportState[] = [];
  const end = minutes * 60 * TICKS_PER_SEC;
  // The first visit: the player opens the app, buys what they can in a few seconds, and leaves.
  state = advanceMany(state, 10 * TICKS_PER_SEC);
  while (state.tick < end) {
    checkIns += 1;
    let bought = false;
    for (let guard = 0; guard < 200; guard++) {
      if (options.sell !== false && wantsToSell(state, state.tick - runStart, 3, false)) {
        state = act(state, 'sell', note, sales);
        runStart = state.tick;
        bought = true;
        continue;
      }
      const pick = wantsNight(state) ? 'night' : bestUpgrade(state);
      if (pick === null || upgradeCost(pick, state.levels[pick]) > state.cash) break;
      state = act(state, pick, note, sales);
      bought = true;
    }
    if (bought) withPurchase += 1;
    states.push(state);
    if (sales.n === 0 && slotsFor(state.run.earned) >= 1 && !milestones.some((m) => m.what === 'slot on offer')) note('slot on offer', state.tick, false);
    if (options.boosts !== false) state = stepAirport(state, boosts(state)).state;
    state = advanceMany(state, Math.min(every, end - state.tick));
  }
  return summarise('idle', milestones, state, [], checkIns === 0 ? null : withPurchase / checkIns, states);
}

/** Cents earned over `seconds` from this state, tapping like the greedy bot or not at all, buying nothing. */
export function earnedOver(state: AirportState, seconds: number, tapping: boolean): number {
  let s = state;
  const end = s.tick + seconds * TICKS_PER_SEC;
  if (!tapping) return advanceMany(s, seconds * TICKS_PER_SEC).run.earned - state.run.earned;
  while (s.tick < end) s = stepAirport(s, taps(s)).state;
  return s.run.earned - state.run.earned;
}

export interface PacingReport {
  readonly greedy: BotRun;
  readonly idle: BotRun;
  /** The same bots never using a boost: what boosts are worth. */
  readonly greedyNoBoosts: BotRun;
  readonly idleNoBoosts: BotRun;
  /** Active over idle income at the greedy bot's snapshots. */
  readonly activeRatios: readonly { readonly minute: number; readonly ratio: number }[];
  /** The same at the levels the greedy bot reaches using boosts. */
  readonly boostedRatios: readonly { readonly minute: number; readonly ratio: number }[];
  /** Estimate over measured idle income at the snapshots. */
  readonly estimateErrors: readonly { readonly minute: number; readonly error: number }[];
  readonly checks: readonly { readonly name: string; readonly value: string; readonly target: string; readonly pass: boolean }[];
  readonly pass: boolean;
}

export function runPacing(options: PacingOptions = {}): PacingReport {
  const greedy = runGreedy(options);
  const idle = runIdle({ ...options, minutes: Math.max(240, options.minutes ?? 0) });
  const greedyNoBoosts = runGreedy({ ...options, boosts: false });
  const idleNoBoosts = runIdle({ ...options, minutes: Math.max(240, options.minutes ?? 0), boosts: false });
  // A 5-minute session: from each of the idle player's check-ins (first airport), play actively for 5 minutes.
  const sessions = idle.checkIns.filter((s) => s.city === 0 && s.tick > 0);
  const sessionsWithUnlock = sessions.filter((from) => runGreedy({ from, minutes: 5, sell: false, snapshotMinutes: [] }).milestones.some((m) => m.novel)).length;
  // What a tap is worth depends on the levels alone, and swings by about 1x from one minute's levels to the next.
  // The check samples the path it was tuned on (no boosts, P9); the boosted path is reported beside it (P11).
  const ratios = (run: BotRun): { minute: number; ratio: number }[] =>
    run.snapshots.map(({ minute, state: s }) => {
      const state = unboosted(s);
      return { minute, ratio: earnedOver(state, 120, true) / Math.max(1, earnedOver(state, 120, false)) };
    });
  const activeRatios = ratios(greedyNoBoosts);
  const boostedRatios = ratios(greedy);
  const estimateErrors = greedy.snapshots.map(({ minute, state: s }) => {
    const state = unboosted(s);
    const measured = earnedOver(state, 600, false) / 600;
    return { minute, error: measured === 0 ? 0 : (estimate(state).incomePerSec - measured) / measured };
  });
  const s = (n: number | null): string => (n === null ? 'never' : n < 120 ? `${n.toFixed(1)} s` : `${(n / 60).toFixed(1)} min`);
  const minRatio = Math.min(...activeRatios.map((r) => r.ratio));
  const maxRatio = Math.max(...activeRatios.map((r) => r.ratio));
  const range = (rs: readonly { ratio: number }[]): string => `${Math.min(...rs.map((r) => r.ratio)).toFixed(2)}-${Math.max(...rs.map((r) => r.ratio)).toFixed(2)}x`;
  const checks = [
    { name: 'First upgrade', value: s(greedy.firstUpgrade), target: '<= 10 s', pass: greedy.firstUpgrade !== null && greedy.firstUpgrade <= 10 },
    { name: 'First new gate (greedy)', value: s(greedy.firstGate), target: '<= 2 min', pass: greedy.firstGate !== null && greedy.firstGate <= 120 },
    { name: 'Longest wait for something new before the first sale (greedy)', value: s(greedy.longestGap), target: '<= 5 min', pass: greedy.longestGap <= 300 },
    { name: 'First sale (greedy)', value: `${s(greedy.firstSale)}${greedy.slotsAtFirstSale === null ? '' : `, ${greedy.slotsAtFirstSale} slots`}`, target: '30-60 min', pass: greedy.firstSale !== null && greedy.firstSale >= 1800 && greedy.firstSale <= 3600 },
    { name: 'First sale (idle, 15-minute check-ins)', value: `${s(idle.firstSale)}${idle.slotsAtFirstSale === null ? '' : `, ${idle.slotsAtFirstSale} slots`}`, target: 'reported', pass: true },
    { name: 'First sale without boosts (greedy; idle)', value: `${s(greedyNoBoosts.firstSale)}; ${s(idleNoBoosts.firstSale)}`, target: 'reported', pass: true },
    { name: 'Active over idle income (tapping, at the no-boost greedy levels)', value: range(activeRatios), target: 'about 2-3x (1.8-3.2)', pass: minRatio >= 1.8 && maxRatio <= 3.2 },
    { name: 'Active over idle income (tapping, at the boosted greedy levels)', value: range(boostedRatios), target: 'reported', pass: true },
    { name: 'Check-ins that buy something (idle, every 15 min)', value: `${Math.round((idle.checkInsWithPurchase ?? 0) * 100)}%`, target: '>= 90%', pass: (idle.checkInsWithPurchase ?? 0) >= 0.9 },
    {
      name: 'A 5-minute active session reaches a new gate, plane or route (from each idle check-in)',
      value: `${sessionsWithUnlock}/${sessions.length}`,
      target: '>= 80%',
      pass: sessions.length > 0 && sessionsWithUnlock >= 0.8 * sessions.length,
    },
    { name: 'Income estimate vs measured idle', value: estimateErrors.map((e) => `${e.error >= 0 ? '+' : ''}${Math.round(e.error * 100)}%`).join(', '), target: 'within 20%', pass: estimateErrors.every((e) => Math.abs(e.error) <= 0.2) },
  ];
  return { greedy, idle, greedyNoBoosts, idleNoBoosts, activeRatios, boostedRatios, estimateErrors, checks, pass: checks.every((c) => c.pass) };
}

export function formatPacing(report: PacingReport, seed: number): string {
  const lines = [`# Airport pacing report (seed ${seed})`, '', '| Check | Result | Target | |', '| --- | --- | --- | --- |'];
  for (const c of report.checks) lines.push(`| ${c.name} | ${c.value} | ${c.target} | ${c.pass ? 'PASS' : 'FAIL'} |`);
  const timeline = (run: BotRun): string[] => {
    const novel = run.milestones.filter((m) => m.novel || m.what.startsWith('slot') || m.what.startsWith('sold'));
    return novel.map((m) => `- ${(m.at / 60).toFixed(1)} min: ${m.what}`);
  };
  const view = airportView(report.greedy.final);
  lines.push('', `## Greedy bot: what it reached and when`, ...timeline(report.greedy));
  lines.push('', `Ended at ${view.city.name} with ${view.slots.owned} slots, levels ${JSON.stringify(report.greedy.final.levels)}.`);
  lines.push('', `## Idle bot (no taps, a check-in every 15 minutes)`, ...timeline(report.idle));
  lines.push(
    '',
    `## Active over idle income (2 minutes of tapping from the greedy bot's airport at each minute; no boosts, with boosts)`,
    ...report.activeRatios.map((r, i) => `- minute ${r.minute}: ${r.ratio.toFixed(2)}x, ${report.boostedRatios[i]?.ratio.toFixed(2) ?? '-'}x`),
  );
  lines.push('', `Overall: ${report.pass ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}
