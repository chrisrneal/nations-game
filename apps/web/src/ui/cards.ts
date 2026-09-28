import { NATIONS, facts, nameOf, type NationFacts } from '../world/nations.ts';

/**
 * Sample decision cards (prompt 04: "fake cards for now"). They use real nations
 * and starting figures but no sim rules: choosing an option sends an ordinary
 * placeholder command (`ping`) to the nation involved, so the player's choice
 * travels the same Host -> command -> step path the AI uses. Real cards are sim
 * State objects with expiry ticks (seam 8) and arrive with the Phase 1 economy.
 */
export interface CardOption {
  readonly id: string;
  readonly label: string;
  /** One line: what this choice does. */
  readonly consequence: string;
  /** Nation the choice is sent to, or none for a choice that stays at home. */
  readonly target: string | null;
}

export interface DecisionCard {
  readonly id: string;
  readonly kind: 'offer' | 'crisis' | 'shortfall';
  readonly title: string;
  readonly context: string;
  readonly expiresAtTick: number;
  readonly options: readonly CardOption[];
}

/** A fresh set of sample cards arrives every this many ticks; unanswered ones expire. */
export const CARD_BATCH_TICKS = 24;

function pick<T>(list: readonly T[], batch: number): T {
  const item = list[batch % list.length];
  if (item === undefined) throw new Error('empty list');
  return item;
}

function others(selfId: string): NationFacts[] {
  return NATIONS.filter((n) => n.playable && n.id !== selfId);
}

export function sampleCards(selfId: string, tick: number): DecisionCard[] {
  const self = facts(selfId);
  const batch = Math.floor(tick / CARD_BATCH_TICKS);
  const expiresAtTick = (batch + 1) * CARD_BATCH_TICKS;
  const rest = others(selfId);

  const partners = self.partners.filter((id) => rest.some((n) => n.id === id));
  const energyRich = [...rest].sort((a, b) => b.energyIndex - a.energyIndex).slice(0, 3).map((n) => n.id);
  const supplier = pick(partners.length > 0 ? partners : energyRich, batch);
  const exposed = [...rest].sort((a, b) => b.climateExposure - a.climateExposure).slice(0, 3);
  const struck = pick(exposed, batch);
  const exporters = [...rest].sort((a, b) => b.foodIndex - a.foodIndex).slice(0, 3);
  const exporter = pick(exporters, batch);

  return [
    {
      id: `offer:${batch}`,
      kind: 'offer',
      title: `${nameOf(supplier)} offers energy`,
      context: `Your energy self-sufficiency starts at ${self.energyIndex}/100. ${nameOf(supplier)} has spare supply for the winter.`,
      expiresAtTick,
      options: [
        { id: 'accept', label: 'Accept', consequence: `Supply secured for six months; ties with ${nameOf(supplier)} deepen.`, target: supplier },
        { id: 'counter', label: 'Counter at a lower price', consequence: 'Cheaper if they agree; they may walk away.', target: supplier },
        { id: 'decline', label: 'Decline', consequence: 'Keep your credit; they will remember.', target: null },
      ],
    },
    {
      id: `crisis:${batch}`,
      kind: 'crisis',
      title: `Floods in ${struck.name}`,
      context: `${struck.name} has one of the highest climate exposures on the board (${struck.climateExposure}/100). The shared relief pool is open.`,
      expiresAtTick,
      options: [
        { id: 'relief', label: 'Send relief', consequence: `Costs credit now; builds goodwill with ${struck.name}.`, target: struck.id },
        { id: 'pool', label: 'Pledge to the shared pool', consequence: 'Counts toward the world goal that multiplies every score.', target: struck.id },
        { id: 'pass', label: 'Pass', consequence: 'No cost now; the collective multiplier may slip.', target: null },
      ],
    },
    {
      id: `shortfall:${batch}`,
      kind: 'shortfall',
      title: 'Grain reserves running low',
      context: `Your food self-sufficiency starts at ${self.foodIndex}/100. ${exporter.name} has grain to sell.`,
      expiresAtTick,
      options: [
        { id: 'buy', label: `Buy from ${exporter.name}`, consequence: `Covers the gap; you lean a little more on ${exporter.name}.`, target: exporter.id },
        { id: 'ration', label: 'Ration at home', consequence: 'No imports; growth slows for a few months.', target: null },
      ],
    },
  ];
}
