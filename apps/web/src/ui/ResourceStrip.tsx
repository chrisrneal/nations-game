import { memo, type ReactElement } from 'react';
import type { NationView } from '@nations/contracts';
import { fmt, outlook, rule, vsBaselinePct, type Good } from './econ.ts';
import { Num, type Why } from './why.tsx';

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
    text: `You produce ${fmt(next.production)} a month and need ${fmt(next.demand)}. Last month you used ${fmt(consumed)}${unmet > 0 ? ` and were ${fmt(unmet)} short` : ''}. ${next.gap > 0 ? `Next month you are ${fmt(next.gap)} short unless you import.` : 'Next month is covered.'} ${per}`,
  };
}

/** Output against the baseline, above the strip: the scoreboard (RULES 2). */
export const OutputLine = memo(function OutputLine(props: { view: NationView; multiplierBp: number }): ReactElement {
  const { view } = props;
  const pct = vsBaselinePct(view.self);
  const last = view.self.private.last;
  return (
    <Num
      className="output"
      why={{
        title: 'Output',
        value: `${fmt(view.self.public.output)} a month · ${pct}% of baseline`,
        text: `Your economy's output last month, against the path the IMF projects for you (${fmt(view.self.public.baselineOutput)}). Your score is this ratio times the world multiplier (now × ${(props.multiplierBp / 10_000).toFixed(2)}). Shortfalls cost ${last.penaltyPct}% last month; trade that covers a deficit adds lasting growth.`,
      }}
    >
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
        text: `Money. You earned ${fmt(p.last.income)} last month (your output) and spent ${fmt(p.last.resilienceSpent)} on resilience. It pays for imports now and crisis pools later; it can reach zero but never go below.`,
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
        text: `How well you absorb a crisis. It slips ${rule(view, 'resilienceDecayPerTick')} a month; your policy refills it from Credit to ${p.policy.resilienceFloor} at ${rule(view, 'resilienceCostPerPoint')} credit a point. Crises arrive in the next phase.`,
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
