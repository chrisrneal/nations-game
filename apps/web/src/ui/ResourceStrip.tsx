import { memo, type ReactElement } from 'react';
import { facts } from '../world/nations.ts';
import { Num } from './why.tsx';

const LATER = 'It becomes a live stock that moves every tick when the Phase 1 economy lands.';

/** Compact money for a 90 px chip: $37.7T, $820B. */
function money(bn: number): string {
  return bn >= 1000 ? `$${(bn / 1000).toFixed(1)}T` : `$${Math.round(bn)}B`;
}

/** The resource strip: four numbers, each tappable for its why-sheet. */
export const ResourceStrip = memo(function ResourceStrip(props: { selfId: string }): ReactElement {
  const n = facts(props.selfId);
  const food = n.foodImportPct < 0 ? `a net cereal exporter (${-n.foodImportPct}% surplus)` : `${n.foodImportPct}% of its cereals imported`;
  const energy = n.energyImportPct < 0 ? `a net energy exporter (${-n.energyImportPct}% surplus)` : `${n.energyImportPct}% of its energy imported`;
  const items = [
    {
      key: 'food',
      icon: '🌾',
      name: 'Food',
      why: {
        title: 'Food',
        value: `${n.foodIndex} / 100`,
        text: `Starting self-sufficiency: ${n.name} is ${food} (FAO). 50 means production just meets demand. ${LATER}`,
      },
    },
    {
      key: 'energy',
      icon: '⚡',
      name: 'Energy',
      why: {
        title: 'Energy',
        value: `${n.energyIndex} / 100`,
        text: `Starting self-sufficiency: ${n.name} is ${energy} (World Bank). 50 means supply just meets demand. ${LATER}`,
      },
    },
    {
      key: 'output',
      icon: '💰',
      name: 'Output',
      why: {
        title: 'Output',
        value: money(n.gdpPppBn),
        text: `Projected 2030 GDP at purchasing-power parity, in US dollars (IMF; T = trillion, B = billion). Your score is growth against this baseline. ${LATER}`,
      },
    },
    {
      key: 'resilience',
      icon: '🛡️',
      name: 'Resilience',
      why: {
        title: 'Resilience',
        value: `${n.preparedness} / 100`,
        text: `Starting pandemic preparedness (Global Health Security Index); climate exposure is ${n.climateExposure}/100. ${LATER}`,
      },
    },
  ];
  return (
    <ul className="strip" aria-label="Resources">
      {items.map((item) => (
        <li key={item.key}>
          <Num why={item.why} className="chip">
            <span className="chip-value">
              <span className="chip-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.why.value.replace(' / 100', '')}
            </span>
            <span className="chip-name">{item.name}</span>
          </Num>
        </li>
      ))}
    </ul>
  );
});
