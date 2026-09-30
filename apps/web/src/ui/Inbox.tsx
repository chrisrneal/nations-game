import { useMemo, useState, type ReactElement } from 'react';
import type { GameUpdate, ResolvedPrediction } from '../platform/index.ts';
import { nameOf } from '../world/nations.ts';
import { cardsFor, type CardAction, type CardOption, type DecisionCard } from './cards.ts';
import { GameOver } from './GameOver.tsx';
import { Recap } from './Recap.tsx';
import { Sheet } from './Sheet.tsx';
import { Num } from './why.tsx';

const OUTCOME_TEXT: Readonly<Record<string, string>> = {
  accept: 'accepted',
  reject: 'declined',
  counter: 'countered',
  contributed: 'paid in',
  pledged: 'pledged',
  declined: 'declined',
};

/** The answer behind a guess, with the AI's own reasons. */
function Reveal(props: { result: ResolvedPrediction; guessed: number; correct: number; onClose: () => void }): ReactElement {
  const { result } = props;
  const pct = props.guessed === 0 ? 0 : Math.round((props.correct * 100) / props.guessed);
  return (
    <Sheet title={result.correct ? 'You called it' : 'Not this time'} onClose={props.onClose}>
      <p className="why-value" data-testid="reveal">
        {nameOf(result.nationId)} {OUTCOME_TEXT[result.outcome] ?? result.outcome}.
      </p>
      <p className="why-text">
        {result.reasons.length > 0
          ? `Why: ${result.reasons.slice(0, 2).join('; ')}.`
          : `${nameOf(result.nationId)} gave no reason the sim could show you: its standing policy answered.`}
      </p>
      <p className="hint">
        Your predictions:{' '}
        <Num
          why={{
            title: 'Prediction accuracy',
            value: `${props.correct} of ${props.guessed} (${pct}%)`,
            text: 'Every guess and the real answer are stored in your save. Gate 2 asks whether a player predicts AI answers 70% of the time after one game; export your save and run the harness report to grade it.',
          }}
        >
          {props.correct} of {props.guessed} right
        </Num>
      </p>
      <button type="button" className="btn btn-primary" onClick={props.onClose}>
        OK
      </button>
    </Sheet>
  );
}

/**
 * Home: the decision inbox. Every card comes from the View (cards.ts): crisis
 * appeals, alerts, offers other nations made you, next month's shortfalls,
 * spare goods worth selling, "What will they do?" questions in prediction
 * mode, and your own offers waiting for an answer. Tap a card, tap an option:
 * two taps from home, with the options at the bottom of the sheet under the
 * thumb. The away recap sits on top after an absence; one tap dismisses it.
 */
export function Inbox(props: {
  update: GameUpdate;
  onAction: (action: CardAction) => Promise<void>;
  onPredict: (id: number, choice: string) => Promise<ResolvedPrediction>;
  onDismissRecap: () => void;
  onNewGame: () => void;
}): ReactElement {
  const { view, standing, journal, predictions, recap } = props.update;
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<ResolvedPrediction | null>(null);
  const cards = useMemo(() => cardsFor(view, dismissed, { journal, predictions }), [view, dismissed, journal, predictions]);
  const open = cards.find((card) => card.id === openId) ?? null;

  const choose = async (card: DecisionCard, option: CardOption): Promise<void> => {
    setBusy(true);
    try {
      if (option.action.kind === 'dismiss') setDismissed((prev) => new Set(prev).add(card.id));
      else if (option.action.kind === 'predict') setRevealed(await props.onPredict(option.action.id, option.action.choice));
      else if (option.action.kind === 'projects') {
        setDismissed((prev) => new Set(prev).add(card.id));
        await props.onAction(option.action);
      }
      else await props.onAction(option.action);
      setOpenId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="inbox" aria-label="Decisions">
      {standing.over && <GameOver update={props.update} onNewGame={props.onNewGame} />}
      {recap !== null && <Recap recap={recap} onDismiss={props.onDismissRecap} />}
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
              text: 'Cards appear when a crisis appeal opens, when a nation sends you an offer, when food or energy will run short next month, or when you have spare goods to sell. While you are away, your standing policies answer for you (Game tab).',
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
                {card.reasons !== undefined && <span className="card-reason">{card.reasons[0]}</span>}
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
          {open.reasons !== undefined && (
            <ul className="reasons" aria-label="Their reasons">
              {open.reasons.slice(0, 3).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
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
      {revealed !== null && (
        <Reveal result={revealed} guessed={predictions.guessed} correct={predictions.correct} onClose={() => setRevealed(null)} />
      )}
    </section>
  );
}
