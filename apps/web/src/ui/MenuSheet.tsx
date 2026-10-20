import { useState, type ReactElement } from 'react';
import type { GameView } from '@snacks/contracts';
import type { Feedback, GameHost } from '../platform/index.ts';
import { PatternDiagram } from './Diagram.tsx';
import { FRIEND_HOW, FRIEND_NAME, FRIEND_ORDER } from './labels.ts';
import { Sheet } from './Sheet.tsx';

/** The menu: today's puzzle, a practice board, switching player, how to play, sound. */
export function MenuSheet(props: { host: GameHost; view: GameView; feedback?: Feedback | undefined; onClose: () => void; onProfiles: () => void }): ReactElement {
  const { host, feedback, onClose } = props;
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(feedback?.prefs.sound ?? false);
  if (help) return <HowToPlay onClose={onClose} />;
  const run = (action: () => Promise<void>): void => {
    void action();
    onClose();
  };
  return (
    <Sheet title="Menu" onClose={onClose}>
      <div className="sheet-actions">
        <button type="button" className="btn btn-wide" onClick={() => run(() => host.daily())}>
          Today’s puzzle
        </button>
        <button type="button" className="btn btn-wide" onClick={() => run(() => host.practice())}>
          New practice board
        </button>
        <button
          type="button"
          className="btn btn-wide"
          onClick={() => {
            onClose();
            props.onProfiles();
          }}
        >
          Switch player
        </button>
        <button type="button" className="btn btn-wide" onClick={() => setHelp(true)}>
          How to play
        </button>
        {feedback !== undefined && (
          <button
            type="button"
            className="btn btn-wide"
            aria-pressed={sound}
            onClick={() => {
              feedback.setPrefs({ ...feedback.prefs, sound: !sound });
              setSound(!sound);
            }}
          >
            Sound: {sound ? 'on' : 'off'}
          </button>
        )}
      </div>
      <p className="sheet-note muted small">
        {props.view.round === 'practice' ? `Practice board ${props.view.seed}` : `Day ${props.view.day}`} · an early test version: plain squares, no art yet.
      </p>
    </Sheet>
  );
}

/** The rules in a 9-year-old's words (RULES 5-8). */
export function HowToPlay(props: { onClose: () => void }): ReactElement {
  return (
    <Sheet title="How to play" onClose={props.onClose}>
      <div className="help">
        <p>Hungry kids stand on the path. Each one wants one snack. Read their card to work out which!</p>
        <p>Snacks start in lunchboxes. A friend standing right next to a lunchbox (not corner to corner) picks up one snack and throws it.</p>
        <p>Put a friend out: tap it in the tray, then tap a grey square. Or drag it there. Drag a friend off the board to put it back.</p>
        <p>Each kind of friend throws its own way. Tap a friend on the board: the squares it can throw to light up green. Tap one to aim it there.</p>
        <ul className="help-friends">
          {FRIEND_ORDER.map((t) => (
            <li key={t}>
              <PatternDiagram type={t} /> <strong>{FRIEND_NAME[t]}</strong> {FRIEND_HOW[t]}.
            </li>
          ))}
        </ul>
        <p>A dashed line shows where each friend’s next throw lands. Tap a kid, or their card above the board, to read their clue.</p>
        <p>A friend in the way catches the snack and throws it on, their own way. A kid in the way takes it. Trees, tables and the edge stop it.</p>
        <p>The first snack to reach a kid counts. The right one: they’re fed! The wrong one: tummy ache. A Nurse next to them can help, once.</p>
        <p>Stuck? Press 💡 Hint: first it says whose card to work on, then which lunchbox feeds them, then it puts a friend out for you. Hints never break your streak.</p>
        <p>Press Go and watch. After each wave you can move friends and buy new ones with your ⭐ points. If more than 3 kids go home hungry, try that wave again.</p>
      </div>
    </Sheet>
  );
}
