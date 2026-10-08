/**
 * The WMS report (RULES 11, decision record W8): what an untouched warehouse
 * does over a few hours on several seeds, with the default plan: orders
 * shipped, on time and in full, fill, money, POs and their appointments, the
 * trailers that left the outbound doors (W10), and how busy the pickers and
 * the dock crew are. It replaced the idle game's pacing bots; its checks are
 * the RULES 11 targets.
 */
import type { WarehouseState } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T, advanceMany, binFullUnits, createWarehouse } from '@warehouse/sim';

export interface SeedReport {
  readonly seed: number;
  readonly shipped: number;
  readonly otifPct: number;
  readonly onTimePct: number;
  readonly fillPct: number;
  /** Cents earned a warehouse hour (a real minute). */
  readonly earnedPerHour: number;
  readonly posClosed: number;
  readonly posLatePct: number;
  /** Share of time working at a bin or the dock, whole %, over each role. */
  readonly pickUtilPct: number;
  readonly receiveUtilPct: number;
  readonly tasksDone: number;
  /** Trailers that left the outbound doors, and their load as a whole % of what they hold (W10). */
  readonly trailers: number;
  readonly trailerFillPct: number;
  /**
   * How full the racks are (W11): every bay's stock against its bin's full
   * mark (capped at 100%), averaged over the bays and over a look every
   * warehouse hour; and the emptiest of those looks.
   */
  readonly rackFillPct: number;
  readonly rackFillLowPct: number;
}

export interface ReportCheck {
  readonly name: string;
  readonly target: string;
  readonly value: string;
  readonly pass: boolean;
}

export interface WmsReport {
  readonly minutes: number;
  readonly seeds: readonly SeedReport[];
  readonly checks: readonly ReportCheck[];
  readonly pass: boolean;
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.floor((part * 100) / whole);
}

function util(s: WarehouseState, role: 'pick' | 'receive'): number {
  let busy = 0;
  let time = 0;
  for (const p of s.wms.workers) {
    if (p.role !== role) continue;
    busy += p.stats.busy;
    time += p.stats.busy + p.stats.walking + p.stats.idle;
  }
  return pct(busy, time);
}

/** Ticks in a warehouse hour, how often the report looks at the racks. */
const HOUR_TICKS = 240;

/** The racks' stock against the full mark, whole % (W11): each bin capped at full, averaged over the bins. */
export function rackFill(s: WarehouseState): number {
  const full = binFullUnits();
  let sum = 0;
  for (const x of s.wms.inventory) sum += Math.min(full, x.onHand);
  return pct(sum, full * s.wms.inventory.length);
}

/** One seed's untouched warehouse after `minutes` real minutes, looking at the racks every warehouse hour on the way. */
export function reportSeed(seed: number, minutes: number): SeedReport {
  let s = createWarehouse({ seed });
  const looks: number[] = [];
  for (let done = 0; done < minutes * 240; ) {
    const ticks = Math.min(HOUR_TICKS, minutes * 240 - done);
    s = advanceMany(s, ticks);
    done += ticks;
    looks.push(rackFill(s));
  }
  const st = s.wms.stats;
  const inb = s.wms.inbound;
  return {
    seed,
    shipped: st.shipped,
    otifPct: pct(st.otif, st.shipped),
    onTimePct: pct(st.onTime, st.shipped),
    fillPct: pct(st.unitsShipped, st.unitsOrdered),
    earnedPerHour: Math.floor(st.earned / Math.max(1, minutes)),
    posClosed: inb.posClosed,
    posLatePct: pct(inb.posLate, inb.posClosed + s.wms.pos.filter((p) => p.status !== 'CLOSED').length),
    pickUtilPct: util(s, 'pick'),
    receiveUtilPct: util(s, 'receive'),
    tasksDone: s.wms.workers.reduce((n, p) => n + p.stats.tasks, 0),
    trailers: st.trailers,
    trailerFillPct: pct(st.unitsShipped, st.trailers * T.wmsTrailerUnits.value),
    rackFillPct: mean(looks),
    rackFillLowPct: Math.min(...looks),
  };
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

/** Every seed's report and the RULES 11 checks over their means. */
export function runReport(options: { readonly seeds?: number; readonly firstSeed?: number; readonly minutes?: number } = {}): WmsReport {
  const minutes = options.minutes ?? 120;
  const first = options.firstSeed ?? 1;
  const seeds = Array.from({ length: options.seeds ?? 8 }, (_, i) => reportSeed(first + i, minutes));
  const otif = mean(seeds.map((r) => r.otifPct));
  const fill = mean(seeds.map((r) => r.fillPct));
  const pick = mean(seeds.map((r) => r.pickUtilPct));
  const receive = mean(seeds.map((r) => r.receiveUtilPct));
  const firstHire = T.wmsHireCostCents.value;
  const earned = mean(seeds.map((r) => r.earnedPerHour));
  const racks = mean(seeds.map((r) => r.rackFillPct));
  const racksLow = Math.min(...seeds.map((r) => r.rackFillLowPct));
  const checks: ReportCheck[] = [
    { name: 'On time and in full', target: '75-95%', value: `${otif}%`, pass: otif >= 75 && otif <= 95 },
    { name: 'Fill rate', target: '95% or more', value: `${fill}%`, pass: fill >= 95 },
    { name: 'Pickers working (not walking or idle)', target: '50-90%', value: `${pick}%`, pass: pick >= 50 && pick <= 90 },
    { name: 'Dock crew working', target: '5-80%', value: `${receive}%`, pass: receive >= 5 && receive <= 80 },
    { name: 'Racks filled (each bay against its full mark, a look every warehouse hour)', target: '55% or more', value: `${racks}%`, pass: racks >= 55 },
    { name: 'Emptiest look at the racks', target: '35% or more', value: `${racksLow}%`, pass: racksLow >= 35 },
    { name: 'Warehouse hours of shipments to pay for the first hire', target: '2-10', value: (firstHire / Math.max(1, earned)).toFixed(1), pass: firstHire / Math.max(1, earned) >= 2 && firstHire / Math.max(1, earned) <= 10 },
  ];
  return { minutes, seeds, checks, pass: checks.every((c) => c.pass) };
}

export function formatReport(r: WmsReport): string {
  const rows = r.seeds.map(
    (s) =>
      `| ${s.seed} | ${s.shipped} | ${s.otifPct}% | ${s.onTimePct}% | ${s.fillPct}% | $${(s.earnedPerHour / 100).toFixed(0)} | ${s.posClosed} | ${s.posLatePct}% | ${s.pickUtilPct}% | ${s.receiveUtilPct}% | ${s.tasksDone} | ${s.trailers} | ${s.trailerFillPct}% | ${s.rackFillPct}% (${s.rackFillLowPct}%) |`,
  );
  const checks = r.checks.map((c) => `| ${c.name} | ${c.target} | ${c.value} | ${c.pass ? 'PASS' : 'FAIL'} |`);
  return [
    `# WMS report: an untouched warehouse, ${r.minutes} minutes (${r.minutes} warehouse hours), default plan`,
    '',
    '| Seed | Shipped | OTIF | On time | Fill | $ a warehouse hour | POs in | POs late | Pickers working | Dock working | Tasks done | Trailers | Trailer fill | Racks filled (emptiest) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '| Check (RULES 11) | Target | Mean | |',
    '|---|---|---|---|',
    ...checks,
    '',
    r.pass ? 'REPORT: PASS' : 'REPORT: FAIL',
  ].join('\n');
}
