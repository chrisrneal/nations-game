import type { ReactElement } from 'react';
import type { GameUpdate } from '../platform/index.ts';
import { fmt, standings } from './econ.ts';
import { Num } from './why.tsx';

/** The end of the game (month 60): final scores for every playable nation, yours highlighted. */
export function GameOver(props: { update: GameUpdate; onNewGame: () => void }): ReactElement {
  const { view, standing } = props.update;
  const rows = standings(view, standing.multiplierBp);
  const rank = rows.findIndex((r) => r.id === view.selfId) + 1;
  const mine = rows[rank - 1];
  const multiplier = (standing.multiplierBp / 10_000).toFixed(2);
  return (
    <section className="gameover" aria-label="Game over" data-testid="game-over">
      <h1 className="section-title">Game over · 2035</h1>
      <p className="why-text">
        You finished{' '}
        <Num
          why={{
            title: 'Your final score',
            value: `${fmt(mine?.score ?? 0)} points`,
            text: `Output at ${mine?.vsBaselinePct ?? 0}% of your own 2030 baseline path, times the world's shared multiplier of ${multiplier}. Every nation is measured against its own baseline, so a small nation can win.`,
          }}
        >
          #{rank} of {rows.length}
        </Num>{' '}
        with{' '}
        <Num
          why={{
            title: 'World multiplier',
            value: `× ${multiplier}`,
            text: 'How well the world did together: nations at their baseline and food and energy demand met. It multiplies every score, from 0.70 to 1.40.',
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
              <td>{row.vsBaselinePct}%</td>
              <td>{fmt(row.score)}</td>
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
