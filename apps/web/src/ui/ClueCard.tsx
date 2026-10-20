import type { ReactElement } from 'react';
import type { GameView, HintTopic, KidView, SnackTrait } from '@snacks/contracts';
import { SHIRTS, SNACK_EMOJI, kidLooks } from './labels.ts';
import { Sheet } from './Sheet.tsx';

/**
 * A kid's full clue card (RULES 6), with today's snacks and their traits to
 * work it out against. It stays open until the player closes it.
 */
export function ClueCard(props: { view: GameView; kid: KidView; about?: readonly HintTopic[]; onClose: () => void }): ReactElement {
  const { view, kid } = props;
  // A hint about this kid's card (RULES 8b) lights the traits it is about.
  const trait = (t: SnackTrait, word: string): ReactElement => <span className={props.about?.includes(t) === true ? 'trait-hint' : undefined}>{word}</span>;
  const looks = kidLooks(kid);
  return (
    <Sheet title={`Kid ${kid.label}’s card`} label="Clue card" onClose={props.onClose}>
      <div className="clue-card">
        <span className="clue-kid big" style={{ background: SHIRTS[kid.look.shirt % SHIRTS.length] }}>
          {kid.label}
        </span>
        <div>
          <p className="clue-card-text">“{kid.clue}”</p>
          {looks !== '' && <p className="muted small">{looks}</p>}
          {kid.healed && <p className="muted small">A Nurse healed them once already.</p>}
        </div>
      </div>
      <h3 className="clue-card-head">Today’s snacks</h3>
      <ul className="snacks">
        {view.snacks.map((s) => (
          <li key={s.id}>
            <span className="snack-emoji">{SNACK_EMOJI[s.id]}</span>
            <span className="snack-what">
              <strong>{s.name}</strong>
              <span className="muted small">
                {trait('colour', s.colour)} · {trait('feel', s.feel)} · {trait('taste', s.taste)} · {trait('shape', s.shape)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {view.kids.some((k) => k.look.sister > 0) && <p className="muted small">Sisters wear the same colour.</p>}
      <button type="button" className="btn btn-primary btn-wide" onClick={props.onClose}>
        Got it
      </button>
    </Sheet>
  );
}
