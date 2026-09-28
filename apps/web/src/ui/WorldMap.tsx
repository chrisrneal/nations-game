import { memo, useMemo, useState, type ReactElement } from 'react';
import type { PlayerView } from '../platform/index.ts';
import { MAP_BOX, labelAt, project } from '../world/positions.ts';
import { NATIONS, label, nameOf, shortName, tiesBetween, type Ties } from '../world/nations.ts';
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
  'Lines show structural ties from the 2030 data. Starting trust is built from exactly these ties once the sim models trust.';

/** The relationship map: every playable nation, with lines from yours sized by ties. */
export const WorldMap = memo(function WorldMap(props: { view: PlayerView }): ReactElement {
  const { view } = props;
  const selfId = view.selfId;
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      NATIONS.filter((n) => n.playable && n.id !== selfId)
        .map((n) => ({ id: n.id, ties: tiesBetween(selfId, n.id) }))
        .sort((a, b) => b.ties.count - a.ties.count || nameOf(a.id).localeCompare(nameOf(b.id))),
    [selfId],
  );
  const self = project(selfId);
  const signals = new Map(view.others.map((o) => [o.id as string, o.public.pingsReceived]));
  const open = openId === null ? null : rows.find((r) => r.id === openId) ?? null;

  return (
    <section className="world" aria-label="World">
      <h1 className="section-title">World</h1>
      <svg className="map" viewBox={`0 0 ${MAP_BOX.width} ${MAP_BOX.height}`} role="img" aria-label="Map of nations and ties">
        <rect width={MAP_BOX.width} height={MAP_BOX.height} rx="6" className="map-sea" />
        {rows.map((row) => {
          if (row.ties.count === 0) return null;
          const p = project(row.id);
          return (
            <line
              key={row.id}
              x1={self.x}
              y1={self.y}
              x2={p.x}
              y2={p.y}
              className="tie"
              strokeWidth={0.5 + row.ties.count * 0.4}
              opacity={0.25 + Math.min(row.ties.count, 6) * 0.1}
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
      <p className="hint">{TRUST_NOTE}</p>
      <ul className="rows">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" className="row" onClick={() => setOpenId(row.id)}>
              <span className="row-name">{nameOf(row.id)}</span>
              <span className="row-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(row.ties.count, 8) * 12.5}%` }} />
              </span>
              <span className="row-value">{row.ties.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Sheet title={nameOf(open.id)} onClose={() => setOpenId(null)}>
          <p className="why-text">
            <Num why={{ title: `Ties with ${nameOf(open.id)}`, value: `${open.ties.count} ties`, text: `${tieSentence(selfId, open.id, open.ties)} ${TRUST_NOTE}` }} />{' '}
            {tieSentence(selfId, open.id, open.ties)}
          </p>
          <p className="why-text">
            Messages received from all nations:{' '}
            <Num
              why={{
                title: 'Messages received',
                value: String(signals.get(open.id) ?? 0),
                text: 'Placeholder activity: how many times any nation has contacted this one. It shows the AI nations acting every tick until real trade arrives.',
              }}
            />
          </p>
        </Sheet>
      )}
    </section>
  );
});
