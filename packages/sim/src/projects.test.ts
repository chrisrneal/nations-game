import { describe, expect, it } from 'vitest';
import type { Command, CrisisHit, Event, NationId, NationRecord, Project, ProjectTemplateId } from '@nations/contracts';
import { CATALOGUE, projectTerms, projectYields, shieldDue, templateOf } from './projects.ts';
import { createSave, loadSave, migrateSave } from './save.ts';
import { step } from './step.ts';
import { TUNABLES } from './tunables.ts';
import { viewFor } from './view.ts';
import { createWorld, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

/**
 * Joint projects (docs/RULES.md section 13, decision record H4). Everyone is
 * `human` and idle unless a test sends a command, so nothing but the rules moves.
 */
const id = (raw: string): NationId => raw as NationId;
const FARM = id('farm'); // food surplus host
const POWER = id('power'); // energy surplus host with minerals
const X = id('x'); // short of both
const Y = id('y'); // short of both
const Z = id('z'); // balanced
const TINY = id('tiny'); // too poor to pay installments
const REG = id('reg'); // background region

const base = { ...NEUTRAL_ENDOWMENT, population: 100_000_000, gdpPppBn: 12_000 };
const ROSTER: RosterEntry[] = [
  { id: 'farm', name: 'Farm', endowment: { ...base, foodSelfSufficiency: 100, blocs: ['b1'] } },
  { id: 'power', name: 'Power', endowment: { ...base, energySelfSufficiency: 100, mineralsEndowment: 60, blocs: ['b1'] } },
  { id: 'x', name: 'X', endowment: { ...base, foodSelfSufficiency: 20, energySelfSufficiency: 20, blocs: ['b1'] } },
  { id: 'y', name: 'Y', endowment: { ...base, foodSelfSufficiency: 20, energySelfSufficiency: 20 } },
  { id: 'z', name: 'Z', endowment: { ...base } },
  { id: 'tiny', name: 'Tiny', endowment: { ...base, gdpPppBn: 20, population: 1_000_000 } },
  { id: 'reg', name: 'Region', endowment: { ...base, kind: 'aggregate' } },
];

function world(): WorldState {
  return createWorld({ seed: 5, roster: ROSTER, controllers: Object.fromEntries(ROSTER.map((r) => [r.id, 'human' as const])) });
}

const propose = (host: NationId, template: ProjectTemplateId, invite: NationId[], tick: number): Command => ({ nationId: host, tick, type: 'proposeProject', payload: { template, invite } });
const join = (who: NationId, projectId: number, tick: number): Command => ({ nationId: who, tick, type: 'joinProject', payload: { projectId } });
const cmd = (who: NationId, type: string, payload: unknown, tick: number): Command => ({ nationId: who, tick, type, payload });

/** Steps until `until` (exclusive), sending `script[tick]` each month; collects every event. */
function run(s: WorldState, until: number, script: Record<number, Command[]> = {}): { state: WorldState; events: Event[] } {
  const events: Event[] = [];
  let state = s;
  while (state.tick < until) {
    const r = step(state, script[state.tick] ?? []);
    events.push(...r.events);
    state = r.state;
  }
  return { state, events };
}

const rejected = (events: readonly Event[]): string[] => events.filter((e) => e.type === 'commandRejected').map((e) => (e.payload as { reason: string }).reason);
const project = (s: WorldState, pid = 1): Project => s.projects.find((p) => p.id === pid) as Project;
const nation = (s: WorldState, n: NationId): NationRecord => s.nations[n] as NationRecord;

describe('the catalogue and who may host (RULES 13.1)', () => {
  it('has the seven templates, each kind at least once', () => {
    expect(CATALOGUE.map((t) => t.id)).toEqual(['solar', 'grid', 'hydrogen', 'grain', 'irrigation', 'earlyWarning', 'vaccines']);
    expect(new Set(CATALOGUE.map((t) => t.kind))).toEqual(new Set(['energy', 'food', 'climateShield', 'pandemicShield']));
  });

  it('a food surplus hosts food projects, an energy surplus with minerals hosts every energy project, anyone hosts shields', () => {
    const s = world();
    const can = (n: NationId): string[] => viewFor(s, n).projects.hostable.filter((h) => h.problem === null).map((h) => h.template);
    expect(can(FARM)).toEqual(['grain', 'irrigation', 'earlyWarning', 'vaccines']);
    expect(can(POWER)).toEqual(['solar', 'grid', 'hydrogen', 'earlyWarning', 'vaccines']);
    expect(can(X)).toEqual(['earlyWarning', 'vaccines']);
  });

  it('terms follow the formulas: yield from the host surplus, cost from yield and unit cost, a shield due from own output', () => {
    const s = world();
    const farm = nation(s, FARM);
    const surplus = farm.public.food.production - farm.public.food.demand;
    const grain = templateOf('grain');
    const t = projectTerms(grain, farm);
    expect(t.yield).toBe(Math.floor((Math.floor((surplus * TUNABLES.projectYieldPct.value) / 100) * grain.yieldPct) / 100));
    expect(t.cost).toBe(Math.floor((t.yield * TUNABLES.projectFoodUnitCost.value * grain.costPct) / 100));
    expect(t.buildTicks).toBe(Math.floor((TUNABLES.projectBuildTicks.value * grain.buildPct) / 100));
    const vaccines = templateOf('vaccines');
    const shield = projectTerms(vaccines, nation(s, X));
    expect(shield.yield).toBe(0);
    expect(shield.cost).toBe(Math.floor((Math.floor((nation(s, X).public.output * TUNABLES.projectShieldCostPct.value) / 100) * vaccines.costPct) / 100));
    expect(shieldDue(vaccines, nation(s, TINY))).toBeLessThan(shield.cost);
  });
});

describe('founding and forming (RULES 13.2)', () => {
  it('a proposal is public, fixes its terms, and only invitees may join', () => {
    const r = run(world(), 1, { 0: [propose(FARM, 'grain', [X, Y, Z], 0)] });
    const p = project(r.state);
    expect(p.status).toBe('forming');
    expect(p.members.map((m) => m.nationId)).toEqual([FARM]);
    expect(p.formingDeadline).toBe(TUNABLES.projectFormingTicks.value - 1);
    const proposed = r.events.find((e) => e.type === 'projectProposed');
    expect(proposed?.audience).toEqual([]);
    const next = run(r.state, 2, { 1: [join(POWER, 1, 1), join(X, 1, 1)] });
    expect(rejected(next.events)).toEqual(['you are not invited to this project']);
    expect(project(next.state).members.map((m) => m.nationId)).toEqual([FARM, X]);
  });

  it('refuses hosts without the surplus, aggregates as invitees, and a second forming project', () => {
    const r = run(world(), 1, {
      0: [propose(X, 'grain', [Y], 0), propose(FARM, 'grain', [REG], 0), propose(FARM, 'irrigation', [X], 0), propose(FARM, 'grain', [Y], 0)],
    });
    // Commands run in nation order: Farm's three, then X's.
    expect(rejected(r.events)).toEqual(['only playable nations can be invited', 'you already have a project forming', expect.stringContaining('food surplus')]);
  });

  it('starts building as soon as every seat is taken', () => {
    const r = run(world(), 1, { 0: [propose(FARM, 'grain', [X, Y, Z], 0), join(X, 1, 0), join(Y, 1, 0), join(Z, 1, 0), join(POWER, 1, 0)] });
    const p = project(r.state);
    expect(p.status).toBe('building');
    expect(p.members).toHaveLength(TUNABLES.projectSlots.value);
    expect(rejected(r.events)).toEqual(['you are not invited to this project']); // Power acts first in nation order
    for (const m of p.members) {
      expect(m.due).toBe(Math.ceil(p.cost / 4));
      expect(m.installment).toBe(Math.ceil(m.due / p.buildTicks));
      expect(m.cap).toBe(2 * m.due);
    }
  });

  it('at the deadline: enough members start building; too few lapse and nothing was paid', () => {
    const deadline = TUNABLES.projectFormingTicks.value - 1;
    const enough = run(world(), deadline + 1, { 0: [propose(FARM, 'grain', [X, Y], 0)], 1: [join(X, 1, 1), join(Y, 1, 1)] });
    expect(project(enough.state).status).toBe('building');
    const few = run(world(), deadline + 1, { 0: [propose(FARM, 'grain', [X, Y], 0)], 1: [join(X, 1, 1), cmd(Y, 'declineProject', { projectId: 1 }, 1)] });
    expect(few.state.projects).toEqual([]);
    expect(few.events.some((e) => e.type === 'projectLapsed')).toBe(true);
    expect(few.state.ledger.creditSpentProjects).toBe(0);
  });
});

/** A grain corridor hosted by FARM with X, Y and Z, full at tick 0. */
function grainWorld(): WorldState {
  return run(world(), 1, { 0: [propose(FARM, 'grain', [X, Y, Z], 0), join(X, 1, 0), join(Y, 1, 0), join(Z, 1, 0)] }).state;
}

describe('building (RULES 13.3)', () => {
  it('collects installments every month into the project sink, never past the cost, and completes', () => {
    const s = grainWorld();
    const p0 = project(s);
    const r = run(s, 1 + p0.buildTicks + 1);
    const p = project(r.state);
    expect(p.status).toBe('active');
    expect(p.paidTotal).toBe(p.cost);
    expect(r.state.ledger.creditSpentProjects).toBe(p.cost);
    expect(p.members.reduce((sum, m) => sum + m.paid, 0)).toBe(p.cost);
    expect(r.events.filter((e) => e.type === 'projectCompleted')).toHaveLength(1);
  });

  it('completing raises trust between every pair of members', () => {
    const s = grainWorld();
    const done = project(run(s, 30).state).completedTick as number;
    // Compare with an idle world right after the completing month. Drift towards baseTrust can run the
    // other way in the two worlds that month (the bonus may lift trust past the base), so allow two drifts.
    const r = run(s, done + 1);
    const idle = run(world(), done + 1);
    for (const [a, b] of [[X, Y], [Y, FARM], [FARM, Z]] as const) {
      const gap = (nation(r.state, a).private.trust[b] as number) - (nation(idle.state, a).private.trust[b] as number);
      expect(gap).toBeGreaterThanOrEqual(TUNABLES.projectTrustBuilt.value - 2 * TUNABLES.trustDecayPerTick.value);
      expect(gap).toBeLessThanOrEqual(TUNABLES.projectTrustBuilt.value);
    }
  });

  it('leaving mid-build forfeits what was paid, costs trust with every remaining member, and delays the build', () => {
    const s = grainWorld();
    const full = run(s, 30);
    const doneFull = project(full.state).completedTick as number;
    const r = run(s, 30, { 3: [cmd(Z, 'leaveProject', { projectId: 1 }, 3)] });
    const p = project(r.state);
    expect(p.left).toEqual([{ nationId: Z, paid: 2 * project(s).members[3]!.installment, tick: 3, reason: 'left' }]);
    expect(p.members.map((m) => m.nationId)).toEqual([FARM, X, Y]);
    expect(p.completedTick as number).toBeGreaterThan(doneFull);
    const trustAt3 = run(s, 3).state;
    const after = run(s, 4, { 3: [cmd(Z, 'leaveProject', { projectId: 1 }, 3)] }).state;
    const stayed = run(trustAt3, 4).state;
    expect(nation(stayed, X).private.trust[Z]! - nation(after, X).private.trust[Z]!).toBe(TUNABLES.projectTrustLeave.value);
  });

  it('the host cannot leave, and nobody leaves an active project', () => {
    const s = grainWorld();
    const r = run(s, 2, { 1: [cmd(FARM, 'leaveProject', { projectId: 1 }, 1)] });
    expect(rejected(r.events)).toEqual(['a host cannot leave its own project']);
    const done = run(s, 30);
    const r2 = run(done.state, 31, { 30: [cmd(X, 'leaveProject', { projectId: 1 }, 30)] });
    expect(rejected(r2.events)).toEqual(['project is not forming or building']);
  });

  it('a member that cannot pay its installment is dropped', () => {
    const r = run(world(), 4, { 0: [propose(FARM, 'grain', [X, Y, TINY], 0), join(X, 1, 0), join(Y, 1, 0), join(TINY, 1, 0)] });
    const p = project(r.state);
    expect(p.members.map((m) => m.nationId)).toEqual([FARM, X, Y]);
    expect(p.left[0]?.reason).toBe('dropped');
  });

  it('funding more speeds the build and raises the share, up to the cap', () => {
    const s = grainWorld();
    const p = project(s);
    const x = p.members[1]!;
    const extra = x.cap - x.installment * 2;
    const r = run(s, 30, { 1: [cmd(X, 'fundProject', { projectId: 1, amount: extra }, 1)] });
    const funded = project(r.state);
    expect(funded.completedTick as number).toBeLessThan(project(run(s, 30).state).completedTick as number);
    const share = (who: NationId): number => funded.members.find((m) => m.nationId === who)!.paid;
    expect(share(X)).toBeGreaterThan(share(Y));
    expect(share(X)).toBeLessThanOrEqual(x.cap);
    const over = run(s, 2, { 1: [cmd(X, 'fundProject', { projectId: 1, amount: x.cap + 1 }, 1)] });
    expect(rejected(over.events)[0]).toMatch(/at most/);
  });
});

describe('active projects (RULES 13.4)', () => {
  it('adds new production to each member by what it paid; the total never exceeds the yield', () => {
    const s = grainWorld();
    // Month 14 falls between the two climate hits of this world, so the host is undamaged.
    const done = run(s, 14).state;
    const noProject = run(world(), 14).state;
    const p = project(done);
    let added = 0;
    for (const m of p.members) {
      const extra = nation(done, m.nationId).public.food.production - nation(noProject, m.nationId).public.food.production;
      expect(extra).toBe(Math.floor((p.yield * m.paid) / p.paidTotal));
      added += extra;
    }
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThanOrEqual(p.yield);
  });

  it('climate damage at the host cuts the yield in proportion', () => {
    const p: Project = { ...project(run(grainWorld(), 20).state) };
    const hit: CrisisHit = { crisisId: 1, kind: 'climate', nationId: FARM, bp: 2_500, bpUnpooled: 5_000, fromTick: 30, toTick: 35 };
    const calm = projectYields([p], [], 30).get(X)!.food;
    const storm = projectYields([p], [hit], 30).get(X)!.food;
    expect(storm).toBe(Math.floor((Math.floor((p.yield * 7_500) / 10_000) * p.members[1]!.paid) / p.paidTotal));
    expect(storm).toBeLessThan(calm);
    expect(projectYields([p], [hit], 36).get(X)!.food).toBe(calm);
  });

  it("a shield cuts its members' climate damage by projectShieldBp after the pool; the unpooled damage is unchanged", () => {
    // Two identical short nations, X in the early-warning network, Y not.
    const s0 = run(world(), 2, { 0: [propose(Z, 'earlyWarning', [X, FARM, POWER], 0)], 1: [join(X, 1, 1), join(FARM, 1, 1), join(POWER, 1, 1)] }).state;
    const r = run(s0, 30);
    expect(project(r.state).status).toBe('active');
    const hits = r.events.filter((e) => e.type === 'crisisHit').map((e) => (e.payload as { hit: CrisisHit }).hit);
    const late = (n: NationId): CrisisHit => hits.filter((h) => h.nationId === n && h.fromTick > (project(r.state).completedTick as number))[0] as CrisisHit;
    expect(late(X).bpUnpooled).toBe(late(Y).bpUnpooled);
    expect(late(X).bp).toBeLessThan(late(Y).bp);
    // Each member paid its own due, a share of its own output.
    const shield = project(r.state);
    for (const m of shield.members) expect(m.paid).toBe(m.due);
    expect(shield.cost).toBe(shield.members.reduce((sum, m) => sum + m.due, 0));
  });

  it("RULES 5.3: no project moves anyone's baseline", () => {
    const withProject = run(grainWorld(), 30).state;
    const without = run(world(), 30).state;
    for (const n of withProject.nationOrder) {
      expect(nation(withProject, n).public.baselineOutput).toBe(nation(without, n).public.baselineOutput);
      expect(nation(withProject, n).private.baselineE4).toBe(nation(without, n).private.baselineE4);
    }
  });
});

describe('views and saves', () => {
  it('every nation sees every project; each sees its own hostable terms', () => {
    const s = grainWorld();
    for (const n of [FARM, X, POWER, REG]) expect(viewFor(s, n).projects.projects.map((p) => p.id)).toEqual([1]);
    expect(viewFor(s, FARM).projects.hostable.find((h) => h.template === 'grain')?.problem).toBe('you already host this project');
  });

  it('a save mid-build reloads to the same game', () => {
    const s = run(grainWorld(), 4).state;
    const loaded = loadSave(JSON.parse(JSON.stringify(createSave(s, [], s))));
    expect(run(loaded.state, 20).state).toEqual(run(s, 20).state);
  });

  it('a schema 4 save with nothing to replay migrates to 5 with no projects', () => {
    const s = world();
    const save = createSave(s, [], s) as unknown as Record<string, unknown>;
    const snap = { ...(save.snapshot as Record<string, unknown>) };
    delete snap.projects;
    delete snap.nextProjectId;
    const ledger = { ...(snap.ledger as Record<string, unknown>) };
    delete ledger.creditSpentProjects;
    const v4 = { ...save, schemaVersion: 4, snapshot: { ...snap, schemaVersion: 4, ledger } };
    const migrated = migrateSave(v4);
    const up = migrated.snapshot as WorldState;
    expect(up.schemaVersion).toBe(5);
    expect(up.projects).toEqual([]);
    expect(up.ledger.creditSpentProjects).toBe(0);
    expect(() => loadSave(migrated)).not.toThrow();
  });
});
