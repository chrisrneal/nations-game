import type { ReactElement } from 'react';
import type { PredictionsView } from '../platform/index.ts';
import { nameOf } from '../world/nations.ts';
import { Num } from './why.tsx';

/**
 * Settings that are not game rules: prediction mode. When it is on, every AI
 * answer to your offers, and the crisis answer of the AI nation you trust
 * most, waits as a "What will they do?" card until you guess. Guesses and the
 * real answers are kept in your save (export it for the harness report).
 */
export function Settings(props: { predictions: PredictionsView; onPredictionMode: (on: boolean) => void }): ReactElement {
  const { predictions } = props;
  const pct = predictions.guessed === 0 ? 0 : Math.round((predictions.correct * 100) / predictions.guessed);
  return (
    <section aria-label="Settings">
      <h2 className="section-subtitle">Settings</h2>
      <ul className="slots">
        <li className="slot">
          <Num
            className="slot-info policy-label"
            why={{
              title: 'Prediction mode',
              value: predictions.mode ? 'On' : 'Off',
              text: 'Before an AI nation’s answer is shown, you are asked what it will do. Your guesses and the real answers are stored in your save, to check whether the AI is predictable enough (Gate 2 asks for 70% after one game).',
            }}
          >
            Prediction mode: ask “What will they do?”
          </Num>
          <button
            type="button"
            role="switch"
            aria-checked={predictions.mode}
            aria-label="Prediction mode"
            className={predictions.mode ? 'switch on' : 'switch'}
            onClick={() => props.onPredictionMode(!predictions.mode)}
          >
            {predictions.mode ? 'On' : 'Off'}
          </button>
        </li>
      </ul>
      {predictions.guessed > 0 && (
        <p className="hint">
          You predicted{' '}
          <Num
            why={{
              title: 'Prediction accuracy',
              value: `${predictions.correct} of ${predictions.guessed} (${pct}%)`,
              text: `Latest: ${predictions.recent
                .slice(0, 3)
                .map((r) => `${nameOf(r.nationId)} ${r.outcome}, you said ${r.guess}${r.correct ? ' ✓' : ''}`)
                .join('; ')}.`,
            }}
          >
            {pct}%
          </Num>{' '}
          of AI answers right.
        </p>
      )}
    </section>
  );
}
