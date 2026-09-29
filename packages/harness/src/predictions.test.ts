import { describe, expect, it } from 'vitest';
import { formatPredictionReport, parsePredictionFile, predictionReport } from './predictions.ts';

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
