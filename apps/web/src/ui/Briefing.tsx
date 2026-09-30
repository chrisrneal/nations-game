import { memo, type ReactElement } from 'react';
import type { NationView } from '@nations/contracts';
import { accordOf, standingOf, upcoming, weakestGoal } from './briefing.ts';
import { fmt, multiplierText } from './econ.ts';
import { scoreWhy } from './ResourceStrip.tsx';
import { Num } from './why.tsx';

/**
 * The top of home (100x slice 7): rank, the World Accord, and what comes
 * next, in two lines a player reads in a second (RULES 5.4). Every number opens
 * its why-sheet.
 */
export const Briefing = memo(function Briefing(props: { view: NationView }): ReactElement {
  const { view } = props;
  const s = standingOf(view);
  const a = accordOf(view);
  const next = upcoming(view);
  const fill = Math.min(100, a.pct);
  return (
    <section className="briefing" aria-label="Briefing" data-testid="briefing">
      <div className="briefing-row">
        <Num className="briefing-rank" why={scoreWhy(view)}>
          <strong>
            #{s.rank}
          </strong>{' '}
          of {s.of} · {fmt(s.score)}
        </Num>
        <Num
          className={a.onTrack ? 'accord on' : 'accord off'}
          why={{
            title: 'The World Accord',
            value: `${a.pct}% of the ${a.needPct}% needed`,
            text: `The world makes the Accord if the four shared goals average ${a.needPct}% or more when the game ends: climate and pandemic damage avoided, nations at their baseline, food and energy demand met. They multiply every score (×${multiplierText(view)} now). You win by the world making it and you ranking high. Weakest now: ${weakestGoal(view)}.`,
          }}
        >
          <span className="accord-label">Accord {a.pct}%</span>
          <span className="accord-bar" aria-hidden="true">
            <span className="accord-fill" style={{ width: `${fill}%` }} />
            <span className="accord-need" style={{ left: `${a.needPct}%` }} />
          </span>
        </Num>
      </div>
      {next.length > 0 && (
        <p className="briefing-next">
          Next: {next.map((u) => `${u.text} month ${u.month}`).join(' · ')}
        </p>
      )}
    </section>
  );
});
