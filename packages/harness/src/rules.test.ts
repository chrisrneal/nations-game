/**
 * Keeps the code saying what docs/RULES.md says: every row of the section 12
 * tunables table exists in the airport tunables with the same value and band,
 * and every airport tunable has a row.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AIRPORT_TUNABLES } from '@airport/sim';

const rules = readFileSync(new URL('../../../docs/RULES.md', import.meta.url), 'utf8');
const section = rules.slice(rules.indexOf('## 12. Tunables'), rules.indexOf('## 13.'));
const rows = [...section.matchAll(/^\| `(\w+)` \| (-?\d+) \| (-?\d+) \| (-?\d+) \|/gm)].map((m) => ({
  id: m[1] as string,
  value: Number(m[2]),
  min: Number(m[3]),
  max: Number(m[4]),
}));
const table = AIRPORT_TUNABLES as Record<string, { value: number; min: number; max: number; note: string }>;

describe('airport tunables match docs/RULES.md section 12', () => {
  it('finds the RULES table', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50);
  });

  it.each(rows.map((r) => [r.id, r] as const))('%s has the RULES value and band', (id, row) => {
    const tunable = table[id];
    expect(tunable, `${id} missing from the airport tunables`).toBeDefined();
    expect([tunable?.min, tunable?.max]).toEqual([row.min, row.max]);
    expect(tunable?.value, `${id}: RULES.md says ${row.value}`).toBe(row.value);
  });

  it('every airport tunable has a RULES row, an integer value inside its band, and a note', () => {
    const documented = new Set(rows.map((r) => r.id));
    expect(Object.keys(table).filter((id) => !documented.has(id))).toEqual([]);
    for (const [id, t] of Object.entries(table)) {
      expect(Number.isSafeInteger(t.value), id).toBe(true);
      expect(t.min <= t.value && t.value <= t.max, id).toBe(true);
      expect(t.note.length, id).toBeGreaterThan(10);
    }
  });
});
