import type { ReactElement } from 'react';
import type { GameView, KidView } from '@snacks/contracts';
import { SHIRTS, SNACK_EMOJI, kidLooks } from './labels.ts';
import { Sheet } from './Sheet.tsx';

/**
 * A kid's full clue card (RULES 6), with today's snacks and their traits to
 * work it out against. It stays open until the player closes it.
 */
export function ClueCard(props: { view: GameView; kid: KidView; onClose: () => void }): ReactElement {
  const { view, kid } = props;
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
                {s.colour} · {s.feel} · {s.taste} · {s.shape}
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
