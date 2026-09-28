import { useMemo, useState, type ReactElement } from 'react';
import { CARD_BATCH_TICKS, sampleCards, type CardOption, type DecisionCard } from './cards.ts';
import { Sheet } from './Sheet.tsx';
import { Num } from './why.tsx';

const ICON: Record<DecisionCard['kind'], string> = { offer: '🤝', crisis: '🌊', shortfall: '🌾' };

/**
 * Home: the decision inbox. Tap a card, tap an option - two taps from home, with
 * the options at the bottom of the sheet under the thumb.
 */
export function Inbox(props: {
  selfId: string;
  tick: number;
  onChoose: (card: DecisionCard, option: CardOption) => Promise<void>;
}): ReactElement {
  const { selfId, tick } = props;
  const batch = Math.floor(tick / CARD_BATCH_TICKS);
  // Recompute only when a new batch arrives, not on every tick.
  const cards = useMemo(() => sampleCards(selfId, batch * CARD_BATCH_TICKS), [selfId, batch]);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<DecisionCard | null>(null);
  const [busy, setBusy] = useState(false);
  const waiting = cards.filter((card) => !done.has(card.id) && card.expiresAtTick > tick);

  const choose = async (card: DecisionCard, option: CardOption): Promise<void> => {
    setBusy(true);
    try {
      await props.onChoose(card, option);
      setDone((prev) => new Set(prev).add(card.id));
      setOpen(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="inbox" aria-label="Decisions">
      <h1 className="section-title">
        Decisions <span className="count">{waiting.length}</span>
      </h1>
      {waiting.length === 0 && (
        <p className="empty">
          Nothing needs you right now. New decisions arrive in{' '}
          <Num
            why={{
              title: 'Next decisions',
              value: `${cards[0]!.expiresAtTick - tick} months`,
              text: 'Sample decisions arrive every 24 world months in this early build. Real ones will come from trade and crises.',
            }}
          />
          .
        </p>
      )}
      <ul className="cards">
        {waiting.map((card) => (
          <li key={card.id}>
            <button type="button" className="card" onClick={() => setOpen(card)}>
              <span className="card-icon" aria-hidden="true">
                {ICON[card.kind]}
              </span>
              <span className="card-body">
                <span className="card-title">{card.title}</span>
                <span className="card-meta">
                  {card.options.length} options · expires in {card.expiresAtTick - tick} months
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <p className="why-text">{open.context}</p>
          <ul className="options">
            {open.options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="btn option"
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
