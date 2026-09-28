import { memo, useMemo, useState, type ReactElement } from 'react';
import type { ForeignNation } from '@nations/contracts';
import type { PlayerView } from '../platform/index.ts';
import { MAP_BOX, labelAt, project } from '../world/positions.ts';
import { NATIONS, label, nameOf, shortName, tiesBetween, type Ties } from '../world/nations.ts';
import { GOODS, balance, fairAmount, fmt, spare, vsBaselinePct, type Good, type TradeDraft } from './econ.ts';
import { Sheet } from './Sheet.tsx';
import { Num } from './why.tsx';

function tieSentence(selfId: string, otherId: string, ties: Ties): string {
  const parts: string[] = [];
  if (ties.alliances.length > 0) parts.push(`alliances ${ties.alliances.map(label).join(', ')}`);
  if (ties.blocs.length > 0) parts.push(`blocs ${ties.blocs.map(label).join(', ')}`);
  if (ties.aListsB) parts.push(`${nameOf(otherId)} is one of ${nameOf(selfId)}'s top trade partners`);
  if (ties.bListsA) parts.push(`${nameOf(selfId)} is one of ${nameOf(otherId)}'s top trade partners`);
  return parts.length === 0 ? 'No shared alliance, bloc or top trade partner.' : `Shared: ${parts.join('; ')}.`;
}

const TRUST_NOTE =
  'Trust starts from these structural ties (RULES section 6), rises 2 with every completed trade, falls when offers are ignored or deals fail, and drifts back towards 35 over time.';

/** A starting trade with a partner: buy what they spare and you lack, else sell what you spare and they lack. */
function draftWith(view: PlayerView, partnerId: string): TradeDraft {
  const partner = view.others.find((o) => o.id === partnerId);
  for (const good of GOODS) {
    if (partner !== undefined && balance(partner, good) > 0 && balance(view.self, good) < 0) {
      const get = { resource: good, amount: Math.min(balance(partner, good), -balance(view.self, good)) };
      return { to: partnerId, give: { resource: 'credit', amount: fairAmount(view, get, 'credit') }, get };
    }
  }
  for (const good of GOODS) {
    const amount = spare(view, good);
    if (partner !== undefined && amount > 0 && balance(partner, good) < 0) {
      const give = { resource: good, amount: Math.min(amount, -balance(partner, good)) };
      return { to: partnerId, give, get: { resource: 'credit', amount: fairAmount(view, give, 'credit') } };
    }
  }
  const get = { resource: 'food' as const, amount: 10 };
  return { to: partnerId, give: { resource: 'credit', amount: fairAmount(view, get, 'credit') }, get };
}

function position(n: ForeignNation, good: Good): string {
  const b = balance(n, good);
  return b >= 0 ? `${fmt(b)} ${good} spare a month` : `${fmt(-b)} ${good} short a month`;
}

/** The relationship map: every playable nation, with lines from yours sized by live trust. */
export const WorldMap = memo(function WorldMap(props: { view: PlayerView; onTrade: (draft: TradeDraft) => void }): ReactElement {
  const { view } = props;
  const selfId = view.selfId;
  const [openId, setOpenId] = useState<string | null>(null);
  const trust = view.self.private.trust;
  const rows = useMemo(
    () =>
      view.others
        .map((o) => ({ id: o.id as string, nation: o, trust: trust[o.id] ?? 0, playable: o.public.kind === 'playable' }))
        .sort((a, b) => b.trust - a.trust || nameOf(a.id).localeCompare(nameOf(b.id))),
    [view.others, trust],
  );
  const self = project(selfId);
  const open = openId === null ? null : rows.find((r) => r.id === openId) ?? null;
  const max = view.rules.trustMax ?? 90;

  return (
    <section className="world" aria-label="World">
      <h1 className="section-title">World</h1>
      <svg className="map" viewBox={`0 0 ${MAP_BOX.width} ${MAP_BOX.height}`} role="img" aria-label="Map of nations and trust">
        <rect width={MAP_BOX.width} height={MAP_BOX.height} rx="6" className="map-sea" />
        {rows
          .filter((row) => row.playable)
          .map((row) => {
            const p = project(row.id);
            return (
              <line
                key={row.id}
                x1={self.x}
                y1={self.y}
                x2={p.x}
                y2={p.y}
                className="tie"
                strokeWidth={0.4 + (row.trust / max) * 2.4}
                opacity={0.15 + (row.trust / max) * 0.7}
              />
            );
          })}
        {NATIONS.filter((n) => n.playable).map((n) => {
          const p = project(n.id);
          const text = labelAt(n.id);
          const mine = n.id === selfId;
          return (
            <g key={n.id} className={mine ? 'dot mine' : 'dot'} onClick={mine ? undefined : () => setOpenId(n.id)}>
              <circle cx={p.x} cy={p.y} r={10} className="hit" />
              <circle cx={p.x} cy={p.y} r={mine ? 3.5 : 2.6} />
              <text x={text.x} y={text.y} textAnchor={text.anchor}>
                {shortName(n.id)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="hint">Lines and bars show your trust in each nation, from 5 to {max}. Regions are listed below the nations.</p>
      <ul className="rows">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" className="row" onClick={() => setOpenId(row.id)}>
              <span className="row-name">{nameOf(row.id)}</span>
              <span className="row-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((row.trust / max) * 100)}%` }} />
              </span>
              <span className="row-value">{row.trust}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Sheet title={nameOf(open.id)} onClose={() => setOpenId(null)}>
          <p className="why-text">
            Your trust:{' '}
            <Num
              why={{
                title: `Trust in ${nameOf(open.id)}`,
                value: `${open.trust} / ${max}`,
                text: `${open.playable ? tieSentence(selfId, open.id, tiesBetween(selfId, open.id)) : 'A background region: it answers offers through its standing policy but never makes one.'} ${TRUST_NOTE}`,
              }}
            />
          </p>
          <p className="why-text">
            <Num
              why={{
                title: `${nameOf(open.id)}'s position`,
                value: `${vsBaselinePct(open.nation)}% of baseline`,
                text: `Public figures: output ${fmt(open.nation.public.output)} a month against a baseline of ${fmt(open.nation.public.baselineOutput)}; ${position(open.nation, 'food')}; ${position(open.nation, 'energy')}.`,
              }}
            >
              {position(open.nation, 'food')} · {position(open.nation, 'energy')}
            </Num>
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setOpenId(null);
              props.onTrade(draftWith(view, open.id));
            }}
          >
            Propose a trade
          </button>
        </Sheet>
      )}
    </section>
  );
});
