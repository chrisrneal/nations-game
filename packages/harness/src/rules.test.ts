/**
 * Checks that the code still says what docs/RULES.md says: every tunable in
 * section 11 exists in packages/sim/src/tunables.ts with the same band and the
 * same starting value, and every tunable in the code is in RULES, and the section 6 starting-trust invariant holds on the
 * real world data (every playable nation's mean trust in the other 16 lies
 * between 25 and 72).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TUNABLES, createWorld, type NationRecord } from '@nations/sim';
import { loadRoster } from './roster.ts';

const rules = readFileSync(new URL('../../../docs/RULES.md', import.meta.url), 'utf8');
const section = rules.slice(rules.indexOf('## 11. Tunables'), rules.indexOf('## 12.'));
const rows = [...section.matchAll(/^\| `(\w+)` \| (-?\d+) \| (-?\d+) \| (-?\d+) \|/gm)].map((m) => ({
  id: m[1] as string,
  value: Number(m[2]),
  min: Number(m[3]),
  max: Number(m[4]),
}));

describe('tunables match docs/RULES.md section 11', () => {
  it('finds the RULES table', () => {
    expect(rows.length).toBeGreaterThanOrEqual(53);
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s is in tunables.ts with the RULES band and starting value', (id, row) => {
    const tunable = (TUNABLES as Record<string, { value: number; min: number; max: number }>)[id];
    expect(tunable, `${id} missing from tunables.ts`).toBeDefined();
    expect([tunable?.min, tunable?.max]).toEqual([row.min, row.max]);
    expect(tunable?.value, `${id}: RULES.md says ${row.value}`).toBe(row.value);
  });

  it('every tunable in tunables.ts has a RULES row', () => {
    const documented = new Set(rows.map((r) => r.id));
    expect(Object.keys(TUNABLES).filter((id) => !documented.has(id))).toEqual([]);
  });

  it('drops the Phase 0 placeholders', () => {
    expect(Object.keys(TUNABLES)).not.toContain('placeholderRollSides');
    expect(Object.keys(TUNABLES)).not.toContain('placeholderReserveMax');
  });
});

describe('starting trust on the real data (RULES section 6)', () => {
  const state = createWorld({ seed: 1, roster: loadRoster() });
  const playable = state.nationOrder.filter((id) => state.nations[id]?.public.kind === 'playable');

  it('every playable nation starts with mean trust in the other 16 between 25 and 72', () => {
    for (const id of playable) {
      const n = state.nations[id] as NationRecord;
      const values = playable.filter((o) => o !== id).map((o) => n.private.trust[o] ?? 0);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(mean, id).toBeGreaterThanOrEqual(25);
      expect(mean, id).toBeLessThanOrEqual(72);
    }
  });

  it('reproduces the worked pairs', () => {
    const t = (a: string, b: string): number => state.nations[a as NationRecord['id']]?.private.trust[b as NationRecord['id']] ?? -1;
    expect(t('japan', 'united-states')).toBe(90);
    expect(t('nigeria', 'japan')).toBe(25);
    expect(t('india', 'china')).toBe(77);
  });

  it('starts every output from the data: United States 3,139 less rounding, China 4,830', () => {
    const out = (id: string): number => state.nations[id as NationRecord['id']]?.public.output ?? 0;
    expect(Math.abs(out('united-states') - 3_139 - Math.floor((3_139 * 45) / 10_000))).toBeLessThanOrEqual(1);
    expect(out('china')).toBeGreaterThanOrEqual(4_830);
  });
});
