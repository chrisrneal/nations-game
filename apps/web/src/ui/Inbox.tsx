import { useMemo, useState, type ReactElement } from 'react';
import type { GameUpdate } from '../platform/index.ts';
import { cardsFor, type CardAction, type CardOption, type DecisionCard } from './cards.ts';
import { GameOver } from './GameOver.tsx';
import { Sheet } from './Sheet.tsx';
import { Num } from './why.tsx';

/**
 * Home: the decision inbox. Every card comes from the View (cards.ts): offers
 * other nations made you, next month's shortfalls, spare goods worth selling,
 * and your own offers waiting for an answer. Tap a card, tap an option: two
 * taps from home, with the options at the bottom of the sheet under the thumb.
 */
export function Inbox(props: {
  update: GameUpdate;
  onAction: (action: CardAction) => Promise<void>;
  onNewGame: () => void;
}): ReactElement {
  const { view, standing } = props.update;
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cards = useMemo(() => cardsFor(view, dismissed), [view, dismissed]);
  const open = cards.find((card) => card.id === openId) ?? null;

  const choose = async (card: DecisionCard, option: CardOption): Promise<void> => {
    setBusy(true);
    try {
      if (option.action.kind === 'dismiss') setDismissed((prev) => new Set(prev).add(card.id));
      else await props.onAction(option.action);
      setOpenId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="inbox" aria-label="Decisions">
      {standing.over && <GameOver update={props.update} onNewGame={props.onNewGame} />}
      <h1 className="section-title">
        Decisions <span className="count">{cards.length}</span>
      </h1>
      {cards.length === 0 && (
        <p className="empty">
          Nothing needs you this month.{' '}
          <Num
            why={{
              title: 'Quiet month',
              value: 'No decisions',
              text: 'Cards appear when a nation sends you an offer, when food or energy will run short next month, or when you have spare goods to sell. While you are away, your standing policies answer offers for you (Saves tab).',
            }}
          />
        </p>
      )}
      <ul className="cards">
        {cards.map((card) => (
          <li key={card.id}>
            <button type="button" className={`card card-${card.kind}`} onClick={() => setOpenId(card.id)}>
              <span className="card-icon" aria-hidden="true">
                {card.icon}
              </span>
              <span className="card-body">
                <span className="card-title">{card.title}</span>
                <span className="card-meta">
                  {card.options.length} options · {card.expiresIn <= 1 ? 'this month' : `${card.expiresIn} months left`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Sheet title={open.title} onClose={() => setOpenId(null)}>
          <p className="why-text">{open.context}</p>
          <ul className="options">
            {open.options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="btn option"
                  data-option={option.id}
                  disabled={busy}
                  onClick={() => void choose(open, option)}
                >
                  <span className="option-label">{option.label}</span>
                  <span className="option-consequence">{option.consequence}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </section>
  );
}
