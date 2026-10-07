/**
 * The WMS report (RULES 11, decision record W8): what an untouched warehouse
 * does over a few hours on several seeds, with the default plan: orders
 * shipped, on time and in full, fill, money, POs and their appointments, and
 * how busy the pickers and receivers are. It replaced the idle game's pacing
 * bots; its checks are the RULES 11 targets.
 */
import type { WarehouseState } from '@warehouse/contracts';
import { advanceMany, createWarehouse } from '@warehouse/sim';

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

/** One seed's untouched warehouse after `minutes` real minutes. */
export function reportSeed(seed: number, minutes: number): SeedReport {
  const s = advanceMany(createWarehouse({ seed }), minutes * 240);
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
  const firstHire = 50_000;
  const earned = mean(seeds.map((r) => r.earnedPerHour));
  const checks: ReportCheck[] = [
    { name: 'On time and in full', target: '75-95%', value: `${otif}%`, pass: otif >= 75 && otif <= 95 },
    { name: 'Fill rate', target: '95% or more', value: `${fill}%`, pass: fill >= 95 },
    { name: 'Pickers working (not walking or idle)', target: '50-90%', value: `${pick}%`, pass: pick >= 50 && pick <= 90 },
    { name: 'Receivers working', target: '5-80%', value: `${receive}%`, pass: receive >= 5 && receive <= 80 },
    { name: 'Minutes of shipments to pay for the first hire', target: '2-10', value: (firstHire / Math.max(1, earned)).toFixed(1), pass: firstHire / Math.max(1, earned) >= 2 && firstHire / Math.max(1, earned) <= 10 },
  ];
  return { minutes, seeds, checks, pass: checks.every((c) => c.pass) };
}

export function formatReport(r: WmsReport): string {
  const rows = r.seeds.map(
    (s) =>
      `| ${s.seed} | ${s.shipped} | ${s.otifPct}% | ${s.onTimePct}% | ${s.fillPct}% | $${(s.earnedPerHour / 100).toFixed(0)} | ${s.posClosed} | ${s.posLatePct}% | ${s.pickUtilPct}% | ${s.receiveUtilPct}% | ${s.tasksDone} |`,
  );
  const checks = r.checks.map((c) => `| ${c.name} | ${c.target} | ${c.value} | ${c.pass ? 'PASS' : 'FAIL'} |`);
  return [
    `# WMS report: an untouched warehouse, ${r.minutes} minutes (${r.minutes} warehouse hours), default plan`,
    '',
    '| Seed | Shipped | OTIF | On time | Fill | $ a warehouse hour | POs in | POs late | Pickers working | Receivers working | Tasks done |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '| Check (RULES 11) | Target | Mean | |',
    '|---|---|---|---|',
    ...checks,
    '',
    r.pass ? 'REPORT: PASS' : 'REPORT: FAIL',
  ].join('\n');
}
