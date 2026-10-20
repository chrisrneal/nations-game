import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.ts';

describe('harness command line', () => {
  it('defaults to the generator report with no arguments', () => {
    expect(parseArgs([])).toEqual({ command: 'report', numbers: {}, strings: {}, switches: [] });
  });

  it('reads the command and its flags', () => {
    const parsed = parseArgs(['report', '--from', '20000', '--days', '60', '--out', 'x']);
    expect(parsed.command).toBe('report');
    expect(parsed.numbers).toEqual({ from: 20000, days: 60 });
    expect(parsed.strings).toEqual({ out: 'x' });
  });

  it('accepts --suite as another way to name the command', () => {
    expect(parseArgs(['--suite', 'bench', '--runs', '3']).command).toBe('bench');
  });

  it('rejects an unknown flag, command, suite or stray word with a clear message', () => {
    expect(() => parseArgs(['report', '--dys', '1'])).toThrow(/Unknown flag --dys for "report".*--days/);
    expect(() => parseArgs(['dock1'])).toThrow(/Unknown harness command "dock1"/);
    expect(() => parseArgs(['--suite', 'dock1'])).toThrow(/Unknown suite "dock1"/);
    expect(() => parseArgs(['report', '200'])).toThrow(/Unexpected argument "200"/);
    expect(() => parseArgs(['bench', '--suite', 'report'])).toThrow(/both "bench" and --suite report/);
  });

  it('rejects a missing or non-whole-number value', () => {
    expect(() => parseArgs(['report', '--from'])).toThrow(/--from needs a whole number/);
    expect(() => parseArgs(['report', '--days', '0'])).toThrow(/--days needs a whole number of at least 1/);
    expect(() => parseArgs(['report', '--out'])).toThrow(/--out needs a value/);
  });

  it('reads switches only where they exist', () => {
    expect(parseArgs(['determinism', '--no-browser']).switches).toEqual(['no-browser']);
    expect(() => parseArgs(['report', '--no-browser'])).toThrow(/Unknown flag --no-browser for "report"/);
    expect(() => parseArgs(['bench', '--out', 'a'])).toThrow(/Unknown flag --out for "bench"/);
  });
});
