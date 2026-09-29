import { describe, expect, it } from 'vitest';
import type { CrisisEventPayloads, Event } from '@nations/contracts';
import { ARCHETYPES } from './bots.ts';
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
    expect(report.absence).toHaveLength(2);
    const names = report.metrics.map((m) => m.name).join('\n');
    for (const needle of ['Crashes', 'Negative stocks', 'Crisis success', 'Defection rate', 'Broken pledges', 'Retaliation rate', 'archetype', 'top scorer', 'free-rider', 'spoiler', 'Dead states', '24-hour absence', 'Gate 1 suite', 'Gate 0', 'predicts AI', 'playtests', '60 fps']) {
      expect(names).toContain(needle);
    }
    expect(report.metrics.find((m) => m.name === 'Crashes')?.value).toBe('0');
    const text = formatGate2(report);
    expect(text).toContain('| Metric | Result | Pass line |');
    expect(text).toContain('## Win rate by archetype (random assignment)');
    expect(text).toContain('## Sample away recap');
  });

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
  const crisisEvents = (strategy: 'freeRider' | 'exploiter' | 'spoiler' | 'trader'): { events: Event[]; who: string } => {
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
