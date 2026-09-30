import { memo, type ReactElement } from 'react';
import type { NationView } from '@nations/contracts';
import { baselineNote, fmt, lastMonthPct, multiplierText, outlook, rule, scoreOf, type Good } from './econ.ts';
import { myProjects, yieldShare } from './projects.ts';
import { Num, type Why } from './why.tsx';

/** What the player's running joint projects add to a good each month, before damage at the hosts (RULES 13.4). */
function projectUnits(view: NationView, good: Good): number {
  return myProjects(view)
    .filter((p) => p.status === 'active' && p.kind === good)
    .reduce((sum, p) => sum + yieldShare(p, view.selfId), 0);
}

/** Credit a month the player's building projects collect in installments (RULES 13.3). */
function installments(view: NationView): number {
  return myProjects(view)
    .filter((p) => p.status === 'building')
    .reduce((sum, p) => {
      const m = p.members.find((x) => x.nationId === view.selfId);
      return sum + (m !== undefined && m.paid < m.cap ? m.installment : 0);
    }, 0);
}

function goodWhy(view: NationView, good: Good): Why {
  const next = outlook(view, good);
  const last = view.self.private.last;
  const consumed = good === 'food' ? last.consumedFood : last.consumedEnergy;
  const unmet = good === 'food' ? last.unmetFood : last.unmetEnergy;
  const name = good === 'food' ? 'Food' : 'Energy';
  const per = good === 'food' ? 'One unit feeds a million people for a month.' : 'One unit powers one unit of output for a month.';
  return {
    title: name,
    value: `${fmt(next.stock)} in store`,
    text: `You produce ${fmt(next.production)} a month${projectUnits(view, good) > 0 ? ` (${fmt(projectUnits(view, good))} of it from joint projects)` : ''} and need ${fmt(next.demand)}. Last month you used ${fmt(consumed)}${unmet > 0 ? ` and were ${fmt(unmet)} short` : ''}. ${next.gap > 0 ? `Next month you are ${fmt(next.gap)} short unless you import.` : 'Next month is covered.'} ${per}`,
  };
}

/**
 * The score why-sheet: the sim's own numbers broken down (RULES 5): your
 * output against your baseline, times the world multiplier, and the four
 * world goals behind the multiplier.
 */
export function scoreWhy(view: NationView): Why {
  const pct = scoreOf(view, view.selfId)?.ownPct ?? lastMonthPct(view.self);
  const final = scoreOf(view, view.selfId)?.finalScore ?? 0;
  const last = view.self.private.last;
  const g = view.scores.goals;
  const goal = (bp: number): string => `${Math.floor(bp / 100)}%`;
  const rank = [...view.scores.nations].sort((a, b) => b.finalScore - a.finalScore).findIndex((n) => n.id === view.selfId) + 1;
  return {
    title: 'Your score',
    value: `${pct}% of baseline × ${multiplierText(view)} = ${fmt(final)} (#${rank} of ${view.scores.nations.length})`,
    text: `${pct}% is your output against your own baseline over about the last year (last month alone: ${fmt(view.self.public.output)} against ${fmt(view.self.public.baselineOutput)}). ${baselineNote(true)} It is multiplied by the world's ×${multiplierText(view)}, set by four shared goals: climate damage avoided ${goal(g.climateAvoidedBp)}, pandemic damage avoided ${goal(g.pandemicAvoidedBp)}, nations at their baseline ${goal(g.atBaselineBp)}, food and energy demand met ${goal(g.deficitsMetBp)}. Last month shortfalls cost ${last.penaltyPct}% of output and crises ${last.crisisPct}%.`,
  };
}

/** Your score against your own baseline, above the strip: the sim's own number (RULES 5). */
export const OutputLine = memo(function OutputLine(props: { view: NationView }): ReactElement {
  const { view } = props;
  const pct = scoreOf(view, view.selfId)?.ownPct ?? lastMonthPct(view.self);
  return (
    <Num className="output" why={scoreWhy(view)}>
      <span data-testid="output">{pct}%</span> of baseline
    </Num>
  );
});

/** The resource strip: four live numbers, each tappable for its why-sheet. */
export const ResourceStrip = memo(function ResourceStrip(props: { view: NationView }): ReactElement {
  const { view } = props;
  const p = view.self.private;
  const food = outlook(view, 'food');
  const energy = outlook(view, 'energy');
  const items: { key: string; icon: string; name: string; value: string; short: boolean; why: Why }[] = [
    { key: 'food', icon: '🌾', name: 'Food', value: fmt(food.stock), short: food.gap > 0, why: goodWhy(view, 'food') },
    { key: 'energy', icon: '⚡', name: 'Energy', value: fmt(energy.stock), short: energy.gap > 0, why: goodWhy(view, 'energy') },
    {
      key: 'credit',
      icon: '💰',
      name: 'Credit',
      value: fmt(p.stocks.credit),
      short: false,
      why: {
        title: 'Credit',
        value: `${fmt(p.stocks.credit)} credit`,
        text: `Money. You earned ${fmt(p.last.income)} last month (your output) and spent ${fmt(p.last.resilienceSpent)} on resilience. You paid ${fmt(p.last.contributed)} into the crisis pools${installments(view) > 0 ? `, and joint projects collect ${fmt(installments(view))} a month in installments` : ''}. It pays for imports, crisis pools and joint projects; it can reach zero but never go below, and a project installment it cannot pay drops you from that project.`,
      },
    },
    {
      key: 'resilience',
      icon: '🛡️',
      name: 'Resilience',
      value: String(p.resilience),
      short: false,
      why: {
        title: 'Resilience',
        value: `${p.resilience} / ${rule(view, 'resilienceMax')}`,
        text: `How well you absorb a crisis. It slips ${rule(view, 'resilienceDecayPerTick')} a month; your policy refills it from Credit to ${p.policy.resilienceFloor} at ${rule(view, 'resilienceCostPerPoint')} credit a point. Higher resilience cuts crisis damage.`,
      },
    },
  ];
  return (
    <ul className="strip" aria-label="Resources">
      {items.map((item) => (
        <li key={item.key}>
          <Num why={item.why} className={item.short ? 'chip short' : 'chip'}>
            <span className="chip-value" data-testid={`chip-${item.key}`}>
              <span className="chip-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.value}
            </span>
            <span className="chip-name">{item.name}</span>
          </Num>
        </li>
      ))}
    </ul>
  );
});
