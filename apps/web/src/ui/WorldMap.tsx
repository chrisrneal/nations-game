import { memo, useMemo, useState, type ReactElement } from 'react';
import type { ForeignNation } from '@nations/contracts';
import type { JournalSnapshot, PlayerView } from '../platform/index.ts';
import { MAP_BOX, labelAt, project } from '../world/positions.ts';
import { NATIONS, label, nameOf, shortName, tiesBetween, type Ties } from '../world/nations.ts';
import { baselineNote, GOODS, amountText, balance, fairAmount, fmt, lastMonthPct, rule, scoreOf, spare, type Good, type TradeDraft } from './econ.ts';
import { EMPTY_JOURNAL, lastWord, said } from './reasons.ts';
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
  'Trust starts from these structural ties (RULES section 6), rises with every completed trade and kept pledge, falls when deals fail or pledges break, and drifts back towards the no-ties level over time.';

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

/**
 * The trust why-sheet's breakdown: where your trust in one nation started and
 * what moved it, counted from the events you saw (the journal), with the
 * remainder put down to drift (RULES section 6).
 */
export function trustBreakdown(view: PlayerView, journal: JournalSnapshot, id: string): string | null {
  const start = journal.startTrust[id];
  const now = (view.self.private.trust as Readonly<Record<string, number>>)[id];
  if (start === undefined || now === undefined) return null;
  const c = journal.causes[id] ?? { trades: 0, reneges: 0, pledgesKept: 0, pledgesBroken: 0, ignored: 0 };
  const parts: [number, string][] = [
    [c.trades * rule(view, 'trustPerTrade'), `${c.trades} trade${c.trades === 1 ? '' : 's'} done`],
    [-c.reneges * rule(view, 'trustPerRenege'), `${c.reneges} deal${c.reneges === 1 ? '' : 's'} they broke`],
    [c.pledgesKept * rule(view, 'trustPerPledgeHonoured'), `${c.pledgesKept} pledge${c.pledgesKept === 1 ? '' : 's'} they kept`],
    [-c.pledgesBroken * rule(view, 'trustPerPledgeBroken'), `${c.pledgesBroken} pledge${c.pledgesBroken === 1 ? '' : 's'} they broke`],
    [-c.ignored * rule(view, 'trustPerIgnoredOffer'), `${c.ignored} offer${c.ignored === 1 ? '' : 's'} they ignored`],
  ];
  const shown = parts.filter(([d]) => d !== 0);
  const explained = shown.reduce((sum, [d]) => sum + d, 0);
  const drift = now - start - explained;
  const since = journal.since === 0 ? 'the start' : `month ${journal.since}`;
  const moves = shown.map(([d, what]) => `${signed(d)} from ${what}`);
  if (drift !== 0) moves.push(`${signed(drift)} from drift towards ${rule(view, 'baseTrust')} and the ${rule(view, 'trustMin')}-${rule(view, 'trustMax')} limits`);
  return `${start} at ${since}${moves.length === 0 ? ', unchanged since' : `; ${moves.join(', ')}`}: ${now} now.`;
}

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
export const WorldMap = memo(function WorldMap(props: { view: PlayerView; journal?: JournalSnapshot; onTrade: (draft: TradeDraft) => void }): ReactElement {
  const { view } = props;
  const journal = props.journal ?? EMPTY_JOURNAL;
  // Trade lines: partners you settled a trade with in the last year, heavier for more trades.
  const traded = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of journal.trades) count.set(t.partner, (count.get(t.partner) ?? 0) + 1);
    return count;
  }, [journal.trades]);
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
        {[...traded.entries()]
          .filter(([id]) => NATIONS.some((n) => n.id === id && n.playable))
          .map(([id, n]) => {
            const p = project(id);
            return <line key={`trade-${id}`} x1={self.x} y1={self.y} x2={p.x} y2={p.y} className="trade" strokeWidth={Math.min(3, 0.8 + n * 0.3)} />;
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
      <p className="hint">
        Solid lines and bars show your trust in each nation, from {view.rules.trustMin ?? 5} to {max}; gold dashes are your trades in the last year ({journal.trades.length}), marked ⇄ in the list. Regions are listed below the nations.
      </p>
      <ul className="rows">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" className="row" onClick={() => setOpenId(row.id)}>
              <span className="row-name">{nameOf(row.id)}</span>
              <span className="row-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((row.trust / max) * 100)}%` }} />
              </span>
              <span className="row-value">
                {traded.has(row.id) && (
                  <span className="row-traded" aria-label="traded this year">
                    ⇄{' '}
                  </span>
                )}
                {row.trust}
              </span>
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
                text: `${trustBreakdown(view, journal, open.id) ?? ''} ${open.playable ? tieSentence(selfId, open.id, tiesBetween(selfId, open.id)) : 'A background region: it answers offers through its standing policy but never makes one.'} ${TRUST_NOTE}`,
              }}
            />
          </p>
          {journal.trades.some((t) => t.partner === open.id) && (
            <p className="why-text">
              Trades this year:{' '}
              {journal.trades
                .filter((t) => t.partner === open.id)
                .slice(-3)
                .map((t) => `you gave ${amountText(t.gave)} for ${amountText(t.got)} (month ${t.tick})`)
                .join('; ')}
              .
            </p>
          )}
          {open.playable && (
            <p className="why-text reason-line">{(() => {
              const note = lastWord(journal, open.id);
              return note === undefined ? `${nameOf(open.id)} has not said anything to you yet.` : `Last said (month ${note.tick}): ${said(note)}`;
            })()}</p>
          )}
          <p className="why-text">
            <Num
              why={{
                title: `${nameOf(open.id)}'s position`,
                value: `${scoreOf(view, open.id)?.ownPct ?? lastMonthPct(open.nation)}% of baseline`,
                text: `Public figures: output ${fmt(open.nation.public.output)} a month against a baseline of ${fmt(open.nation.public.baselineOutput)}; ${position(open.nation, 'food')}; ${position(open.nation, 'energy')}. ${scoreOf(view, open.id) === undefined ? 'Background regions are not scored.' : `The percent is its score over about the last year. ${baselineNote(false)}`}`,
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
