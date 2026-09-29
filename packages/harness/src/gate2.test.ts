import { describe, expect, it } from 'vitest';
import type { CrisisEventPayloads, Event } from '@nations/contracts';
import { ARCHETYPES, type Strategy } from './bots.ts';
import { playGame } from './game.ts';
import { assignArchetypes, formatGate2, runGate2 } from './gate2.ts';
import { loadRoster } from './roster.ts';

const roster = loadRoster();
const playable = roster.filter((r) => r.endowment?.kind === 'playable').map((r) => r.id);

describe('gate2 suite', () => {
  it('assigns the five archetypes deterministically and uses all of them', () => {
    expect(assignArchetypes(5, playable)).toEqual(assignArchetypes(5, playable));
    const seen = new Set<string>();
    for (let seed = 1; seed < 20; seed++) for (const a of Object.values(assignArchetypes(seed, playable))) seen.add(a);
    expect([...seen].sort()).toEqual([...ARCHETYPES].sort());
  });

  it('runs a small batch and reports every Gate 2 metric', () => {
    const report = runGate2({ games: 2, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true });
    expect(report.games).toBe(2);
    expect(report.freeRiderPairs).toHaveLength(2);
    expect(report.spoilerPairs).toHaveLength(2);
    expect(report.stealthPairs).toHaveLength(2);
    // The stealth spoiler replays the cooperator's game up to mid-game, from the same cooperator run.
    expect(report.stealthPairs.map((p) => p.coop)).toEqual(report.spoilerPairs.map((p) => p.coop));
    for (const p of report.stealthPairs) expect(p.coopRank).toBeGreaterThanOrEqual(1);
    expect(report.absence).toHaveLength(2);
    const names = report.metrics.map((m) => m.name).join('\n');
    for (const needle of ['Crashes', 'Negative stocks', 'Crisis success', 'Defection rate', 'Broken pledges', 'Retaliation rate', 'archetype', 'top scorer', 'free-rider', 'spoiler', 'stealth spoiler', 'rank change', 'Dead states', '24-hour absence', 'Gate 1 suite', 'Gate 0', 'predicts AI', 'playtests', '60 fps']) {
      expect(names).toContain(needle);
    }
    expect(report.metrics.find((m) => m.name === 'Crashes')?.value).toBe('0');
    const text = formatGate2(report);
    expect(text).toContain('| Metric | Result | Pass line |');
    expect(text).toContain('## Win rate by archetype (random assignment)');
    expect(text).toContain('## Sabotage from mid-game');
    expect(text).toContain('stealth spoiler (keeps trading)');
    expect(text).toContain('## Sample away recap');
  });

  it('grades the prompt 14 lines separately, and reports the cooperator\'s own share for the owner\'s ruling', () => {
    const report = runGate2({ games: 2, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true });
    const line = (needle: string) => report.metrics.find((m) => m.name.includes(needle));
    const graded = ['Free-rider tops / fair share (prompt 14)', 'Free-rider tops below the cooperator (prompt 14)', 'Cooperator ahead of the free-rider (prompt 14)', 'Cooperator vs free-rider median gap (prompt 14)', 'Stealth spoiler strictly below the cooperator (prompt 14)'];
    for (const needle of graded) expect(typeof line(needle)?.pass, needle).toBe('boolean');
    expect(line('Free-rider tops / fair share (prompt 14)')?.passLine).toBe('<= 1.50x');
    expect(line('Cooperator ahead of the free-rider (prompt 14)')?.passLine).toBe('>= 70%');
    expect(line('Cooperator vs free-rider median gap (prompt 14)')?.passLine).toBe('>= +3%');
    const own = line('Cooperator\'s own tops / fair share');
    expect(own).toBeDefined();
    expect(own?.pass).toBeNull();
    expect(own?.value).toMatch(/^\d+\.\d{2}x$/);
  }, 30_000);

  it('the prompt 14 lines follow the numbers: the free-rider\'s share and the cooperator\'s lead', () => {
    const report = runGate2({ games: 3, firstSeed: 1, roster, ticks: 24, absenceSeeds: 1, skipGate1: true });
    const total = Object.values(report.archetypes).reduce((sum, a) => sum + a.assigned, 0);
    const ratio = (name: string): number => {
      const a = report.archetypes[name]!;
      return a.assigned === 0 ? 0 : a.tops / report.games / (a.assigned / total);
    };
    const value = (needle: string): string => report.metrics.find((m) => m.name.includes(needle))!.value;
    expect(value('Free-rider tops / fair share (prompt 14)')).toBe(`${ratio('freeRider').toFixed(2)}x`);
    expect(value('Cooperator\'s own tops / fair share')).toBe(`${ratio('trader').toFixed(2)}x`);
    const ahead = report.freeRiderPairs.filter((p) => p.coop > p.other).length / report.freeRiderPairs.length;
    expect(value('Cooperator ahead of the free-rider (prompt 14)')).toBe(`${(ahead * 100).toFixed(1)}%`);
  }, 30_000);

  it('the absence runs leave nothing unanswered and recap in a few short lines', () => {
    const report = runGate2({ games: 1, firstSeed: 3, roster, ticks: 60, absenceSeeds: 2, skipGate1: true });
    for (const run of report.absence) {
      expect(run.offersLapsed).toBe(0);
      expect(run.appealsAnswered).toBeGreaterThanOrEqual(run.appealsDue);
      expect(run.pledgesDue).toBe(1);
      expect(run.pledgesResolved).toBe(1);
      expect(run.recap.lines.length).toBeLessThanOrEqual(6);
      expect(run.words).toBeLessThanOrEqual(150);
    }
    expect(report.metrics.find((m) => m.name.startsWith('24-hour absence'))?.pass).toBe(true);
  }, 30_000);
});

describe('crisis bots', () => {
  const crisisEvents = (strategy: Strategy): { events: Event[]; who: string } => {
    const who = 'nigeria';
    const events: Event[] = [];
    playGame({ seed: 4, ticks: 20, roster, strategies: { [who]: strategy }, humanSwitch: false, onTick: (_s, e) => events.push(...e) });
    return { events, who };
  };
  const lockedAs = (events: Event[], who: string, role: 'contributors' | 'freeRiders'): number =>
    events.filter((e) => e.type === 'crisisLocked' && (e.payload as CrisisEventPayloads['crisisLocked']).result[role].includes(who as never)).length;

  it('the trader contributes (reciprocal cooperator); the free-rider never does', () => {
    const trader = crisisEvents('trader');
    expect(lockedAs(trader.events, trader.who, 'contributors')).toBeGreaterThan(0);
    const free = crisisEvents('freeRider');
    expect(lockedAs(free.events, free.who, 'contributors')).toBe(0);
    expect(lockedAs(free.events, free.who, 'freeRiders')).toBeGreaterThan(0);
  });

  it('the trader and the free-rider are the shipped AI: every command explains itself; the bots do not', () => {
    const said = (events: Event[], who: string): number =>
      events.filter((e) => e.type === 'explanation' && (e.payload as CrisisEventPayloads['explanation']).nationId === who && (e.payload as CrisisEventPayloads['explanation']).by === 'command').length;
    for (const s of ['trader', 'freeRider', 'stealthSpoiler'] as const) {
      const { events, who } = crisisEvents(s);
      expect(said(events, who), s).toBeGreaterThan(10);
    }
    const hoarder = crisisEvents('hoarder');
    expect(said(hoarder.events, hoarder.who)).toBe(0);
  });

  it('the stealth spoiler keeps trading like the AI, pays nothing, and pledges twice its share then breaks it', () => {
    const { events, who } = crisisEvents('stealthSpoiler');
    const trades = events.filter((e) => e.type === 'offerSettled' && [e.payload as { offer: { from: string; to: string } }].some((p) => p.offer.from === who || p.offer.to === who)).length;
    expect(trades).toBeGreaterThan(5);
    expect(lockedAs(events, who, 'contributors')).toBe(0);
    const made = events.filter((e) => e.type === 'pledgeMade' && (e.payload as CrisisEventPayloads['pledgeMade']).pledge.nationId === who);
    expect(made.length).toBeGreaterThan(0);
    const broken = events.filter((e) => e.type === 'pledgeBroken' && (e.payload as CrisisEventPayloads['pledgeBroken']).pledge.nationId === who);
    expect(broken.length).toBe(made.length);
  });

  it('refuses to switch a nation to the free-rider mid-game', () => {
    expect(() => playGame({ seed: 1, ticks: 2, roster, humanSwitch: false, switches: [{ tick: 1, nation: 'nigeria', strategy: 'freeRider' }] })).toThrow(/freeRider/);
  });

  it('the exploiter and the spoiler pledge and then break their pledges', () => {
    for (const s of ['exploiter', 'spoiler'] as const) {
      const { events, who } = crisisEvents(s);
      const made = events.filter((e) => e.type === 'pledgeMade' && (e.payload as CrisisEventPayloads['pledgeMade']).pledge.nationId === who).length;
      const broken = events.filter((e) => e.type === 'pledgeBroken' && (e.payload as CrisisEventPayloads['pledgeBroken']).pledge.nationId === who);
      expect(made).toBeGreaterThan(0);
      expect(broken.length).toBe(made);
      expect(broken.every((e) => (e.payload as CrisisEventPayloads['pledgeBroken']).reason === 'withdrawn')).toBe(true);
    }
  });
});
