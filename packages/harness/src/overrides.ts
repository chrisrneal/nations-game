import { TUNABLES, refreshRules } from '@nations/sim';
import { AIRPORT_TUNABLES } from '@nations/sim/airport';

/**
 * `--set id=value[,id=value]` for tuning sweeps: replaces sim tunables (the
 * airport's first, then the Nations sim's until slice 8 removes it) for one
 * harness run, so several settings can be swept in parallel processes without
 * editing packages/sim/src/tunables.ts. Every value must be a whole number
 * inside the band tunables.ts declares (the band is the limit of tuning; going
 * outside it is a design change).
 *
 * The change reaches the numbers the sim reads from `TUNABLES` directly and,
 * through `refreshRules` (prompt 17), the copy of the rules every View carries,
 * so a number only the AI reads from its View sweeps too.
 */
type Mutable = { value: number; min: number; max: number };

function tableFor(id: string): Record<string, Mutable | undefined> {
  const airport = AIRPORT_TUNABLES as unknown as Record<string, Mutable | undefined>;
  return airport[id] !== undefined ? airport : (TUNABLES as unknown as Record<string, Mutable | undefined>);
}

/** Parses and validates a `--set` value. Throws an Error with a user-facing message. */
export function parseOverrides(spec: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of spec.split(',').filter((p) => p.length > 0)) {
    const at = pair.indexOf('=');
    if (at < 1) throw new Error(`--set needs id=value pairs, got "${pair}".`);
    const id = pair.slice(0, at);
    const raw = pair.slice(at + 1);
    const tunable = tableFor(id)[id];
    if (tunable === undefined) throw new Error(`Unknown tunable "${id}" in --set.`);
    const value = Number(raw);
    if (raw === '' || !Number.isSafeInteger(value)) throw new Error(`--set ${id} needs a whole number, got "${raw}".`);
    if (value < tunable.min || value > tunable.max) throw new Error(`--set ${id}=${value} is outside its band [${tunable.min}, ${tunable.max}].`);
    if (id in out) throw new Error(`--set gave ${id} twice.`);
    out[id] = value;
  }
  return out;
}

/** Applies validated overrides to the sim's tunables. Returns a function that puts every value back. */
export function applyOverrides(values: Readonly<Record<string, number>>): () => void {
  const before = Object.entries(values).map(([id]) => [id, (tableFor(id)[id] as Mutable).value] as const);
  for (const [id, value] of Object.entries(values)) (tableFor(id)[id] as Mutable).value = value;
  refreshRules();
  return () => {
    for (const [id, value] of before) (tableFor(id)[id] as Mutable).value = value;
    refreshRules();
  };
}
