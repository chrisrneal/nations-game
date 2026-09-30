import { describe, expect, it } from 'vitest';
import { formatPlaytestReport, formatPredictionReport, parsePredictionFile, playtestReport, predictionReport } from './predictions.ts';

const record = (id: number, nationId: string, kind: string, outcome: string, guess: string | null, status = guess === null ? 'lapsed' : 'guessed') => ({
  id,
  tick: id,
  nationId,
  kind,
  question: 'q',
  outcome,
  reasons: [],
  guess,
  guessedTick: guess === null ? null : id,
  status,
});

function file(humanId: string, records: unknown[]): string {
  return JSON.stringify({ format: 'nations-game-save', version: 1, exportedAt: 0, game: { humanId, aiSeed: 1, save: {}, predictions: { version: 1, mode: true, nextId: 9, records } } });
}

describe('prediction accuracy report', () => {
  it('grades guessed questions only, across files, by kind, answer and nation', () => {
    const a = parsePredictionFile(
      'a.json',
      file('japan', [record(1, 'egypt', 'offer', 'reject', 'reject'), record(2, 'egypt', 'offer', 'accept', 'reject'), record(3, 'china', 'appeal', 'contributed', 'contributed'), record(4, 'china', 'offer', 'accept', null)]),
    );
    const b = parsePredictionFile('b.json', file('india', [record(1, 'brazil', 'offer', 'counter', 'counter'), record(2, 'brazil', 'offer', 'reject', 'reject')]));
    const r = predictionReport([a, b]);
    expect(r.total).toEqual({ guessed: 5, correct: 4 });
    expect(r.lapsed).toBe(1);
    expect(r.accuracyPct).toBe(80);
    expect(r.pass).toBe(true);
    expect(r.byKind.offer).toEqual({ guessed: 4, correct: 3 });
    expect(r.byOutcome.accept).toEqual({ guessed: 1, correct: 0 });
    expect(r.byNation.egypt).toEqual({ guessed: 2, correct: 1 });
    const text = formatPredictionReport(r);
    expect(text).toMatch(/4 of 5 right: 80% - PASS/);
    expect(text).toMatch(/\| a\.json \| japan \| 3 \| 2 \| 67% \|/);
  });

  it('fails under 70% and says so when there is no data', () => {
    const low = parsePredictionFile('c.json', file('mexico', [record(1, 'usa', 'offer', 'accept', 'reject'), record(2, 'usa', 'offer', 'accept', 'accept')]));
    expect(predictionReport([low])).toMatchObject({ accuracyPct: 50, pass: false });
    const none = predictionReport([parsePredictionFile('d.json', JSON.stringify({ humanId: 'korea', save: {} }))]);
    expect(none.pass).toBe(false);
    expect(formatPredictionReport(none)).toMatch(/NO DATA/);
  });

  it('refuses files that are not saves', () => {
    expect(() => parsePredictionFile('x.json', 'nope')).toThrow(/x\.json: not JSON/);
    expect(() => parsePredictionFile('y.json', '{"format":"other"}')).toThrow(/not a Nations saved game/);
  });
});

describe('playtest tally (Gate 2 line 7)', () => {
  const file = (name: string, who: string | null, again: string | null, interesting = ''): string =>
    JSON.stringify({ format: 'nations-game-save', game: { humanId: 'japan', predictions: { records: [] }, playtest: { version: 1, who, again, interesting } } });
  const parse = (name: string, text: string) => parsePredictionFile(name, text);

  it('counts owner and others, would-play-again per group, and quotes every interesting choice', () => {
    const files = [
      parse('a.json', file('a', 'owner', 'yes', 'Whether to pay into the Saudi solar belt or the pool')),
      parse('b.json', file('b', 'other', 'no')),
      parse('c.json', file('c', 'other', 'yes', 'Walking out of Brazil\'s hydrogen corridor')),
      parse('d.json', JSON.stringify({ humanId: 'korea', save: {} })),
    ];
    const r = playtestReport(files);
    expect(r).toMatchObject({ total: 3, byOwner: 1, byOthers: 2, mostWantAnother: true, verdict: 'NOT YET' });
    expect(r.again.owner.yes).toBe(1);
    expect(r.again.other).toEqual({ yes: 1, unsure: 0, no: 1, none: 0 });
    expect(r.interesting.map((i) => i.line)).toEqual(['Whether to pay into the Saudi solar belt or the pool', "Walking out of Brazil's hydrogen corridor"]);
    const text = formatPlaytestReport(r);
    expect(text).toContain('3 playtests (owner 1, others 2)');
    expect(text).toContain('"Walking out');
  });

  it('passes with 10 playtests, 3 by others and most wanting another game; fails when most do not', () => {
    const many = (yes: number) =>
      Array.from({ length: 10 }, (_, i) => parse(`${i}.json`, file(String(i), i < 3 ? 'other' : 'owner', i < yes ? 'yes' : 'no')));
    expect(playtestReport(many(6)).verdict).toBe('PASS');
    expect(playtestReport(many(5)).verdict).toBe('FAIL');
  });
});
