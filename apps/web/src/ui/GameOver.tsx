import type { ReactElement } from 'react';
import type { GameUpdate } from '../platform/index.ts';
import { outcomeOf } from './briefing.ts';
import { baselineNote, fmt, multiplierNote, multiplierText, standings } from './econ.ts';
import { myProjects, templateOf, yieldShare } from './projects.ts';
import { Num } from './why.tsx';

/** The end of the game (month 60): final scores for every playable nation, yours highlighted. */
export function GameOver(props: { update: GameUpdate; onNewGame: () => void }): ReactElement {
  const { view } = props.update;
  const rows = standings(view);
  const rank = rows.findIndex((r) => r.id === view.selfId) + 1;
  const mine = rows[rank - 1];
  const multiplier = multiplierText(view);
  const outcome = outcomeOf(view);
  const built = myProjects(view).filter((p) => p.status === 'active');
  const p = view.self.private;
  const debrief = [
    built.length === 0
      ? 'You built no joint projects.'
      : `You built ${built.length} joint project${built.length === 1 ? '' : 's'}: ${built.map((x) => `${templateOf(view, x.template).name}${yieldShare(x, view.selfId) > 0 ? ` (${fmt(yieldShare(x, view.selfId))} a month)` : ''}`).join(', ')}.`,
    `You paid ${fmt(p.pooledTotal)} credit into the crisis pools; pledges kept ${p.pledgesHonoured}, broken ${p.pledgesBroken}.`,
    `${fmt(p.tradesSettled)} trades settled; deals you failed to honour: ${p.reneges}.`,
  ];
  return (
    <section className="gameover" aria-label="Game over" data-testid="game-over">
      <h1 className="section-title">Game over · 2035</h1>
      <p className={`outcome outcome-${outcome.outcome}`} data-testid="outcome">
        {outcome.headline}
      </p>
      <p className="why-text">{outcome.detail}</p>
      <ul className="debrief" aria-label="Your game">
        {debrief.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="why-text">
        You finished{' '}
        <Num
          why={{
            title: 'Your final score',
            value: `${fmt(mine?.score ?? 0)} points`,
            text: `Output at ${mine?.vsBaselinePct ?? 0}% of your own baseline over the last year, times the world's shared multiplier of ${multiplier}. ${baselineNote(true)} Every nation is measured against its own baseline, so a small nation can win.`,
          }}
        >
          #{rank} of {rows.length}
        </Num>{' '}
        with{' '}
        <Num
          why={{
            title: 'World multiplier',
            value: `× ${multiplier}`,
            text: multiplierNote(view),
          }}
        >
          × {multiplier}
        </Num>
        .
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nation</th>
            <th>Baseline</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={row.id === view.selfId ? 'mine' : undefined}>
              <td>{i + 1}</td>
              <td>{row.name}</td>
              <td>
                <Num
                  why={{
                    title: `${row.name} against its baseline`,
                    value: `${row.vsBaselinePct}%`,
                    text: `${row.name}'s output over about the last year as a percent of its own baseline. ${baselineNote(false)} Above 100% means it grew faster than expected.`,
                  }}
                >
                  {row.vsBaselinePct}%
                </Num>
              </td>
              <td>
                <Num
                  why={{
                    title: `${row.name}'s final score`,
                    value: `${fmt(row.score)} points`,
                    text: `${row.vsBaselinePct}% of baseline times the world multiplier of ${multiplier}, the same multiplier for every nation. The table ranks by this number, exactly as the game scores it.`,
                  }}
                >
                  {fmt(row.score)}
                </Num>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-primary" onClick={props.onNewGame}>
        New game
      </button>
    </section>
  );
}
