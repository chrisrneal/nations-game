import type { Command, ControllerSlot, Event, NationEndowment, NationId, NationView } from '@nations/contracts';
import type { ExplanationEvent } from './explain.ts';
import { NationMind, type MindSnapshot } from './mind.ts';
import type { Personality } from './personality.ts';
import { rule } from './util.ts';

/**
 * Runs every AI nation inside a per-tick compute budget (docs/AI_DESIGN.md
 * "Budget and staggering").
 *
 * Each tick, for every nation with a mind:
 * - perceive (always): the events it may see since the last tick;
 * - react (always, for `ai` and `caretaker` nations): announcements, offer
 *   answers and pledges. Never deferred, so retaliation and S8 answers can
 *   never be starved by the budget;
 * - think (staggered): nation i re-scores its goals on ticks where
 *   tick % aiGoalRescoreTicks == i % aiGoalRescoreTicks, if the budget
 *   allows; otherwise it waits, first in line, for the next tick;
 * - trade (budgeted): only while the tick's budget has room.
 * The starting nation rotates each tick so no nation is always last.
 *
 * Work is counted in units (one candidate scored = 1), not milliseconds, so
 * the budget is deterministic and identical on every machine.
 */
export interface AiDirectorOptions {
  /** Every nation in the world with its published data (id and name included). */
  readonly endowments: readonly NationEndowment[];
  /** Seed for scoring noise; the host derives it from the game seed. */
  readonly seed: number;
  /** Nations the AI plays without ever paying into a pool (the free-rider in the AI's Gate 2 check). */
  readonly freeRiders?: readonly string[];
  /**
   * Nations that replace their investment plan with a flat rule: spend this
   * percent of spare Credit each month (the harness's fixed-rate strategies,
   * docs/balance/gate2-prompt17.md). 0 never invests.
   */
  readonly investRates?: Readonly<Record<string, number>>;
}

export interface TickUsage {
  readonly tick: number;
  readonly units: number;
  readonly budget: number;
  readonly thought: readonly NationId[];
  /** Nations that were due to think but waited for budget. */
  readonly deferred: readonly NationId[];
  /** Nations that skipped proactive trading for budget. */
  readonly tradeSkipped: readonly NationId[];
}

export interface DirectorOutput {
  readonly commands: readonly Command[];
  /** One per command, plus announcements; deliver each to its audience. */
  readonly explanations: readonly ExplanationEvent[];
  readonly usage: TickUsage;
}

export interface DirectorSnapshot {
  readonly version: 1;
  readonly minds: readonly MindSnapshot[];
  readonly overdue: readonly string[];
  readonly pending: readonly Event[];
}

export class AiDirector {
  private readonly minds = new Map<NationId, NationMind>();
  private readonly order: NationId[] = [];
  private pending: Event[] = [];
  /** Nations whose think was deferred, oldest first. */
  private overdue: NationId[] = [];

  constructor(options: AiDirectorOptions) {
    const world = options.endowments.reduce((sum, e) => sum + e.gdpPppBn, 0);
    for (const e of options.endowments) {
      if (e.kind !== 'playable') continue;
      const id = e.id as NationId;
      this.minds.set(id, new NationMind(id, e, world, options.seed, !(options.freeRiders ?? []).includes(id), options.investRates?.[id] ?? null));
      this.order.push(id);
    }
  }

  mind(id: NationId): NationMind | undefined {
    return this.minds.get(id);
  }

  personalityOf(id: NationId, view: Pick<NationView, 'rules'>): Personality | undefined {
    return this.minds.get(id)?.personalityOf(view);
  }

  /** Hand over the events of the tick just stepped. Each mind later sees only its own audience. */
  observe(events: readonly Event[]): void {
    this.pending.push(...events);
  }

  decide(tick: number, controllerOf: (id: NationId) => ControllerSlot | undefined, viewOf: (id: NationId) => NationView): DirectorOutput {
    const commands: Command[] = [];
    const explanations: ExplanationEvent[] = [];
    const thought: NationId[] = [];
    const deferred: NationId[] = [];
    const tradeSkipped: NationId[] = [];
    let units = 0;
    const spend = (n: number): void => {
      units += n;
    };
    const events = this.pending;
    this.pending = [];
    if (this.order.length === 0) return { commands, explanations, usage: { tick, units, budget: 0, thought, deferred, tradeSkipped } };

    const views = new Map<NationId, NationView>();
    const viewOfCached = (id: NationId): NationView => {
      let v = views.get(id);
      if (v === undefined) {
        v = viewOf(id);
        views.set(id, v);
      }
      return v;
    };

    // Perceive for every mind, human nations included, so a caretaker takes over with a current memory.
    for (const id of this.order) this.minds.get(id)!.perceive(viewOfCached(id), events);

    const first = viewOfCached(this.order[0]!);
    const budget = rule(first, 'aiBudgetUnitsPerTick');
    const interval = Math.max(1, rule(first, 'aiGoalRescoreTicks'));
    const start = tick % this.order.length;
    const rotated = [...this.order.slice(start), ...this.order.slice(0, start)];
    const active = rotated.filter((id) => {
      const c = controllerOf(id);
      return c === 'ai' || c === 'caretaker';
    });
    const index = new Map(this.order.map((id, i) => [id, i]));
    const due = new Set<NationId>(this.overdue.filter((id) => active.includes(id)));
    for (const id of active) if (tick % interval === (index.get(id)! % interval)) due.add(id);
    // Overdue nations go first, in the order they were deferred.
    const queue = [...this.overdue.filter((id) => active.includes(id)), ...active.filter((id) => !this.overdue.includes(id))];
    this.overdue = [];

    for (const id of queue) {
      const mind = this.minds.get(id)!;
      const view = viewOfCached(id);
      const thinkCost = view.others.length * 4;
      const tradeCost = view.others.length * 2;
      let think = due.has(id);
      if (think && units + thinkCost > budget && mind.thoughtAt >= 0) {
        think = false;
        deferred.push(id);
        this.overdue.push(id);
      }
      if (think) thought.push(id);
      const trade = units + tradeCost <= budget;
      if (!trade) tradeSkipped.push(id);
      const out = mind.act(view, { think, trade, spend });
      commands.push(...out.commands);
      explanations.push(...out.explanations);
    }
    return { commands, explanations, usage: { tick, units, budget, thought, deferred, tradeSkipped } };
  }

  snapshot(): DirectorSnapshot {
    return {
      version: 1,
      minds: this.order.map((id) => this.minds.get(id)!.snapshot()),
      overdue: [...this.overdue],
      pending: [...this.pending],
    };
  }

  /** A director that continues exactly where `snapshot` left off. */
  static restore(options: AiDirectorOptions, snapshot: DirectorSnapshot): AiDirector {
    if (snapshot.version !== 1) throw new Error(`Unknown AI snapshot version ${String(snapshot.version)}`);
    const director = new AiDirector(options);
    for (const s of snapshot.minds) director.minds.get(s.id as NationId)?.restore(s);
    director.overdue = snapshot.overdue.map((id) => id as NationId);
    director.pending = [...snapshot.pending];
    return director;
  }
}

/** Endowments from roster entries shaped like the sim's `RosterEntry` (id, name, endowment). */
export function endowmentsOf(
  roster: readonly { readonly id: string; readonly name: string; readonly endowment?: Omit<NationEndowment, 'id' | 'name'> }[],
): NationEndowment[] {
  return roster.flatMap((r) => (r.endowment === undefined ? [] : [{ ...r.endowment, id: r.id, name: r.name }]));
}
