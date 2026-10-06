import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.ts';

describe('harness command line', () => {
  it('defaults to the pacing pass with no arguments', () => {
    expect(parseArgs([])).toEqual({ command: 'pacing', numbers: {}, strings: {}, switches: [] });
  });

  it('reads the command and its flags', () => {
    const parsed = parseArgs(['pacing', '--seed', '4', '--minutes', '60', '--out', 'x', '--set', 'rushLoadBp=30000']);
    expect(parsed.command).toBe('pacing');
    expect(parsed.numbers).toEqual({ seed: 4, minutes: 60 });
    expect(parsed.strings).toEqual({ out: 'x', set: 'rushLoadBp=30000' });
  });

  it('accepts --suite as another way to name the command', () => {
    expect(parseArgs(['--suite', 'bench', '--runs', '3']).command).toBe('bench');
  });

  it('rejects an unknown flag, command, suite or stray word with a clear message', () => {
    expect(() => parseArgs(['pacing', '--sed', '1'])).toThrow(/Unknown flag --sed for "pacing".*--seed/);
    expect(() => parseArgs(['dock1'])).toThrow(/Unknown harness command "dock1"/);
    expect(() => parseArgs(['--suite', 'dock1'])).toThrow(/Unknown suite "dock1"/);
    expect(() => parseArgs(['pacing', '200'])).toThrow(/Unexpected argument "200"/);
    expect(() => parseArgs(['bench', '--suite', 'pacing'])).toThrow(/both "bench" and --suite pacing/);
  });

  it('rejects a missing or non-whole-number value', () => {
    expect(() => parseArgs(['pacing', '--seed'])).toThrow(/--seed needs a whole number/);
    expect(() => parseArgs(['pacing', '--minutes', '0'])).toThrow(/--minutes needs a whole number of at least 1/);
    expect(() => parseArgs(['pacing', '--out'])).toThrow(/--out needs a value/);
  });

  it('reads switches only where they exist', () => {
    expect(parseArgs(['determinism', '--no-browser']).switches).toEqual(['no-browser']);
    expect(() => parseArgs(['pacing', '--no-browser'])).toThrow(/Unknown flag --no-browser for "pacing"/);
    expect(() => parseArgs(['bench', '--set', 'a=1'])).toThrow(/Unknown flag --set for "bench"/);
  });
});
