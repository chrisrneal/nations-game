import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.ts';

describe('harness command line', () => {
  it('defaults to play with no arguments', () => {
    expect(parseArgs([])).toEqual({ command: 'play', numbers: {}, strings: {}, switches: [] });
  });

  it('reads the command and its flags', () => {
    const parsed = parseArgs(['gate1', '--games', '50', '--seed', '401', '--ranges', '4', '--out', 'x']);
    expect(parsed.command).toBe('gate1');
    expect(parsed.numbers).toEqual({ games: 50, seed: 401, ranges: 4 });
    expect(parsed.strings).toEqual({ out: 'x' });
  });

  it('accepts --suite gate1 as an alias for the gate1 command', () => {
    expect(parseArgs(['--suite', 'gate1', '--games', '200']).command).toBe('gate1');
    expect(parseArgs(['--games', '200', '--suite', 'gate1']).numbers).toEqual({ games: 200 });
  });

  it('rejects an unknown flag with a clear message', () => {
    expect(() => parseArgs(['gate1', '--gmaes', '200'])).toThrow(/Unknown flag --gmaes for "gate1".*--games/);
    expect(() => parseArgs(['--ranges', '4'])).toThrow(/Unknown flag --ranges for "play"/);
  });

  it('rejects an unknown command, an unknown suite and a stray word', () => {
    expect(() => parseArgs(['gate2'])).toThrow(/Unknown harness command "gate2"/);
    expect(() => parseArgs(['--suite', 'gate2'])).toThrow(/Unknown suite "gate2"/);
    expect(() => parseArgs(['gate1', '200'])).toThrow(/Unexpected argument "200"/);
  });

  it('rejects a command given twice, even through --suite', () => {
    expect(() => parseArgs(['bench', '--suite', 'gate1'])).toThrow(/both "bench" and --suite gate1/);
  });

  it('rejects a missing or non-whole-number value', () => {
    expect(() => parseArgs(['gate1', '--games'])).toThrow(/--games needs a whole number/);
    expect(() => parseArgs(['gate1', '--games', 'ten'])).toThrow(/--games needs a whole number/);
    expect(() => parseArgs(['gate1', '--ranges', '0'])).toThrow(/--ranges needs a whole number of at least 1/);
    expect(() => parseArgs(['gate1', '--out'])).toThrow(/--out needs a value/);
  });

  it('reads switches', () => {
    expect(parseArgs(['determinism', '--no-browser']).switches).toEqual(['no-browser']);
    expect(() => parseArgs(['gate1', '--no-browser'])).toThrow(/Unknown flag --no-browser for "gate1"/);
  });
});
