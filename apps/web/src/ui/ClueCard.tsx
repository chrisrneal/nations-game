import type { ReactElement } from 'react';
import type { GameView, HintTopic, KidView, SnackTrait } from '@snacks/contracts';
import { FactIcons, FeatureIcon, TraitIcon } from './art/Marks.tsx';
import { SnackArt } from './art/Snack.tsx';
import { KidBadge } from './KidBadge.tsx';
import { kidLooks } from './labels.ts';
import { Sheet } from './Sheet.tsx';

const TRAITS: readonly SnackTrait[] = ['colour', 'feel', 'taste', 'shape'];

/**
 * A kid's full clue card (RULES 6), with today's snacks and their traits to
 * work it out against. Every trait is a picture as well as a word (K10): the
 * clue's pictures match the pictures beside the snack they point at, and a
 * colour carries its own mark, so the card can be solved without seeing
 * colour. It stays open until the player closes it.
 */
export function ClueCard(props: { view: GameView; kid: KidView; about?: readonly HintTopic[]; onClose: () => void }): ReactElement {
  const { view, kid } = props;
  // A hint about this kid's card (RULES 8b) lights the traits it is about.
  const looks = kidLooks(kid);
  return (
    <Sheet title={`Kid ${kid.label}’s card`} label="Clue card" onClose={props.onClose}>
      <div className="clue-card">
        <KidBadge kid={kid} big />
        <div>
          <p className="clue-card-text">“{kid.clue}”</p>
          {kid.facts !== null && <FactIcons className="big" facts={kid.facts} />}
          {looks !== '' && <p className="muted small">{looks}</p>}
          {kid.healed && <p className="muted small">A Nurse healed them once already.</p>}
        </div>
      </div>
      <h3 className="clue-card-head">Today’s snacks</h3>
      <ul className="snacks">
        {view.snacks.map((s) => (
          <li key={s.id}>
            <SnackArt className="snack-pic" snack={s.id} />
            <span className="snack-what">
              <strong>{s.name}</strong>
              <span className="traits">
                {TRAITS.map((t) => (
                  <span key={t} className={`trait${props.about?.includes(t) === true ? ' trait-hint' : ''}`}>
                    <TraitIcon trait={t} value={s[t]} />
                    {s[t]}
                  </span>
                ))}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {view.kids.some((k) => k.look.sister > 0) && (
        <p className="muted small sisters">
          <FeatureIcon feature="sister" /> Sisters wear the same shirt.
        </p>
      )}
      <button type="button" className="btn btn-primary btn-wide" onClick={props.onClose}>
        Got it
      </button>
    </Sheet>
  );
}
