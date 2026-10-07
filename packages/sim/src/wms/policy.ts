import type { WmsPickRule, WmsPolicy, WmsReleaseMode } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { log, type MWms } from './mutable.ts';

/** The choices on the Plan page (W7), in the order shown; an event's `qty` is the index into these. */
export const WMS_PICK_RULES: readonly WmsPickRule[] = ['priority', 'cutoff', 'nearest'];
export const WMS_RELEASE_MODES: readonly WmsReleaseMode[] = ['waves', 'continuous', 'manual'];

/** Everyone on the WMS floor: pickers plus receivers (W7). The plan splits them; at least one of each. */
export function wmsCrew(): number {
  return T.wmsPickers.value + T.wmsReceivers.value;
}

/** A new warehouse's plan: the WMS's own rules, `wmsPickers` picking and the rest receiving. */
export function defaultPolicy(): WmsPolicy {
  return { pick: 'priority', release: 'waves', pickers: T.wmsPickers.value };
}

/** Why a plan cannot be used, or null (W7). */
export function policyProblem(p: WmsPolicy): string | null {
  if (!WMS_PICK_RULES.includes(p.pick)) return 'Unknown pick order';
  if (!WMS_RELEASE_MODES.includes(p.release)) return 'Unknown release mode';
  if (!Number.isInteger(p.pickers) || p.pickers < 1 || p.pickers > wmsCrew() - 1) return `Pickers must be 1 to ${wmsCrew() - 1}`;
  return null;
}

/** Puts the pickers back to `count`: new ones start idle at the pick-and-drop point; the highest ids leave first, and the line each was on waits again, its count undone. */
function resizePickers(w: MWms, count: number): void {
  while (w.pickers.length < count) w.pickers.push({ id: w.pickers.length + 1, order: 0, line: 0, progress: 0, at: -1, walk: 0 });
  for (const p of w.pickers.splice(count)) {
    if (p.order === 0) continue;
    const line = w.orders.find((o) => o.no === p.order)?.lines.find((l) => l.no === p.line);
    if (line !== undefined && line.status === 'PICKING') {
      line.status = 'ALLOCATED';
      line.picked = 0;
    }
  }
}

/** Puts the receivers back to `count`, the same way: a line half counted in is counted again from the start. */
function resizeReceivers(w: MWms, count: number): void {
  while (w.receivers.length < count) w.receivers.push({ id: w.receivers.length + 1, po: 0, line: 0, progress: 0 });
  for (const rc of w.receivers.splice(count)) {
    if (rc.po === 0) continue;
    const line = w.pos.find((po) => po.no === rc.po)?.lines.find((l) => l.no === rc.line);
    if (line !== undefined && line.status === 'RECEIVING') {
      line.status = 'OPEN';
      line.received = 0;
    }
  }
}

/**
 * Sets the operating plan (RULES 16, W7): one PLAN event per setting that
 * changed. The crew split takes effect at once. Returns false if nothing
 * changed; the plan must already be valid (`policyProblem`).
 */
export function setPolicy(w: MWms, p: WmsPolicy, tick: number): boolean {
  const was = w.policy;
  let changed = false;
  if (p.pick !== was.pick) {
    log(w, { tick, code: 'PLAN', line: 1, qty: WMS_PICK_RULES.indexOf(p.pick) });
    changed = true;
  }
  if (p.release !== was.release) {
    log(w, { tick, code: 'PLAN', line: 2, qty: WMS_RELEASE_MODES.indexOf(p.release) });
    // Back to timed waves: the next one goes out a full interval from now.
    if (p.release === 'waves') w.nextWaveAt = tick + T.wmsWaveTicks.value;
    changed = true;
  }
  if (p.pickers !== was.pickers) {
    resizePickers(w, p.pickers);
    resizeReceivers(w, wmsCrew() - p.pickers);
    log(w, { tick, code: 'PLAN', line: 3, qty: p.pickers, of: wmsCrew() });
    changed = true;
  }
  w.policy = { pick: p.pick, release: p.release, pickers: p.pickers };
  return changed;
}
