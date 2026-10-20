/**
 * Keeps the code saying what docs/RULES.md says: every row of the Tunables
 * table exists in SNACK_TUNABLES with the same value and band, and every
 * tunable has a row.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SNACK_TUNABLES } from '@snacks/sim';

const rules = readFileSync(new URL('../../../docs/RULES.md', import.meta.url), 'utf8');
const section = rules.slice(rules.indexOf('## 14. Tunables'), rules.indexOf('## 15.'));
const rows = [...section.matchAll(/^\| `(\w+)` \| (-?\d+) \| (-?\d+) \| (-?\d+) \|/gm)].map((m) => ({
  id: m[1] as string,
  value: Number(m[2]),
  min: Number(m[3]),
  max: Number(m[4]),
}));
const table = SNACK_TUNABLES as Record<string, { value: number; min: number; max: number; note: string }>;

describe('tunables match docs/RULES.md section 14', () => {
  it('finds the RULES table', () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s has the RULES value and band', (id, row) => {
    const tunable = table[id];
    expect(tunable, `${id} missing from SNACK_TUNABLES`).toBeDefined();
    expect([tunable?.min, tunable?.max]).toEqual([row.min, row.max]);
    expect(tunable?.value, `${id}: RULES.md says ${row.value}`).toBe(row.value);
  });

  it('every tunable has a RULES row, an integer value inside its band, and a note', () => {
    const documented = new Set(rows.map((r) => r.id));
    expect(Object.keys(table).filter((id) => !documented.has(id))).toEqual([]);
    for (const [id, t] of Object.entries(table)) {
      expect(Number.isSafeInteger(t.value), id).toBe(true);
      expect(t.min <= t.value && t.value <= t.max, id).toBe(true);
      expect(t.note.length, id).toBeGreaterThan(10);
    }
  });
});
