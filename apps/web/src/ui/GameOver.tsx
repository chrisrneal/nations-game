import { useState, type ReactElement } from 'react';
import type { GameUpdate, PlaytestAnswers } from '../platform/index.ts';
import { outcomeOf } from './briefing.ts';
import { baselineNote, fmt, multiplierNote, multiplierText, standings } from './econ.ts';
import { myProjects, templateOf, yieldShare } from './projects.ts';
import { Num } from './why.tsx';

/** The end of the game (month 60): final scores for every playable nation, yours highlighted. */
export interface PlaytestActions {
  readonly answer: (update: Partial<Omit<PlaytestAnswers, 'version'>>) => void;
  readonly save: () => void;
}

/**
 * The three playtest questions (Gate 2 line 7; docs/playtests/README.md):
 * answered in taps, every one skippable, stored in the save; then one tap
 * saves the playtest file to send to the owner.
 */
function Playtest(props: { answers: PlaytestAnswers; actions: PlaytestActions }): ReactElement {
  const { answers, actions } = props;
  const [text, setText] = useState(answers.interesting);
  const seg = <T extends string>(value: T | null, options: readonly (readonly [T, string])[], pick: (v: T) => void, name: string): ReactElement => (
    <div className="seg" role="radiogroup" aria-label={name}>
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'seg-btn on' : 'seg-btn'} onClick={() => pick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <section className="playtest" aria-label="Three quick questions" data-testid="playtest">
      <h2 className="section-subtitle">Three quick questions</h2>
      <p className="hint">For the playtest log. Skip any of them.</p>
      <p className="playtest-q">Who played?</p>
      {seg(answers.who, [['owner', 'The owner'], ['other', 'Someone else']] as const, (who) => actions.answer({ who }), 'Who played')}
      <p className="playtest-q">Would you play another game?</p>
      {seg(answers.again, [['yes', 'Yes'], ['unsure', 'Not sure'], ['no', 'No']] as const, (again) => actions.answer({ again }), 'Play again')}
      <label className="playtest-q" htmlFor="interesting">
        Which choice felt most interesting? (optional)
      </label>
      <input
        id="interesting"
        className="partner playtest-input"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => actions.answer({ interesting: text })}
      />
      <button
        type="button"
        className="btn btn-primary"
        data-testid="save-playtest"
        onClick={() => {
          actions.answer({ interesting: text });
          actions.save();
        }}
      >
        Save playtest file
      </button>
    </section>
  );
}

export function GameOver(props: { update: GameUpdate; onNewGame: () => void; playtest?: PlaytestActions }): ReactElement {
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
      {props.playtest !== undefined && <Playtest answers={props.update.playtest} actions={props.playtest} />}
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
