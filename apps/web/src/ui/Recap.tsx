import type { ReactElement } from 'react';
import type { AwayRecap } from '../platform/index.ts';
import { tickDate } from '../world/nations.ts';
import { Num } from './why.tsx';

const KIND_ICON: Readonly<Record<string, string>> = {
  score: '📈',
  crisis: '🌪️',
  pledge: '🤞',
  trade: '🤝',
  trust: '🧭',
  policy: '📋',
  ai: '💬',
};

/**
 * The away recap (RULES 8.1): what happened while you were gone, most
 * important first, short enough to read in under a minute. One tap dismisses it.
 */
export function Recap(props: { recap: AwayRecap; onDismiss: () => void }): ReactElement {
  const { recap } = props;
  const months = recap.toTick - recap.fromTick;
  return (
    <section className="recap" aria-label="While you were away" data-testid="recap">
      <h2 className="recap-title">
        While you were away ·{' '}
        <Num
          why={{
            title: 'Away recap',
            value: `${months} month${months === 1 ? '' : 's'}: ${tickDate(recap.fromTick)} to ${tickDate(recap.toTick)}`,
            text: `The world ran on the live clock while the app was closed, and your standing policies answered for you. This phone caught up the ${months} months in ${recap.catchUpMs} ms. The ${recap.lines.length} lines are ranked by how much they matter to you (${recap.words} words, under a minute to read).`,
          }}
        >
          {months} month{months === 1 ? '' : 's'}
        </Num>
      </h2>
      <ol className="recap-lines">
        {recap.lines.map((line) => (
          <li key={line.text} className={`recap-line recap-${line.kind}`}>
            <span aria-hidden="true">{KIND_ICON[line.kind] ?? '•'}</span>
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-primary" data-testid="recap-dismiss" onClick={props.onDismiss}>
        Got it
      </button>
    </section>
  );
}
