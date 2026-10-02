import type { ReactElement } from 'react';
import type { AwayRecap } from '../platform/index.ts';
import { formatCash } from './format.ts';
import { recapLines } from './recap.ts';

/** Welcome back: three lines and one tap to collect (RULES 9). */
export function Recap(props: { recap: AwayRecap; onCollect: () => void }): ReactElement {
  const lines = recapLines(props.recap);
  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Collect" onClick={props.onCollect} />
      <section className="sheet recap" role="dialog" aria-modal="true" aria-label="While you were away" data-testid="recap">
        <h2 className="sheet-title">{props.recap.skipped ? 'Skipped ahead' : 'While you were away'}</h2>
        <p className="recap-earned">+{formatCash(props.recap.earned)}</p>
        <ol className="recap-lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <button type="button" className="btn btn-primary btn-wide" onClick={props.onCollect} data-testid="collect">
          Collect
        </button>
      </section>
    </div>
  );
}
