import type { ReactElement, ReactNode } from 'react';
import type { WaveResult } from '@snacks/contracts';
import { SNACK_EMOJI, hintsText, hungryOf, kidLine, snackEndWords, waveReport } from './labels.ts';

/**
 * What a wave did, laid over the board once its replay ends (RULES 7): who
 * was fed, who got a tummy ache, who the Nurse healed, hungry kids against
 * the allowance and the points earned. One button carries on.
 */
export function ResultOverlay(props: {
  wave: WaveResult;
  label: (kid: number) => string;
  hungry: number;
  hungryAllowed: number;
  /** Main mode counts hungry kids and points; Kindy cannot be lost. */
  main: boolean;
  /** Main mode: hints used this wave and today (RULES 8b). */
  hints?: { readonly wave: number; readonly today: number };
  children: ReactNode;
}): ReactElement {
  const { wave, label } = props;
  const report = waveReport(wave, label);
  const names = (kids: readonly string[]): string => (kids.length === 0 ? 'nobody' : kids.join(', '));
  return (
    <section className="result-overlay" aria-label="What happened">
      <div className="result-card">
        <h2>
          Wave {wave.wave}: {report.fed.length} of {wave.kids.length} fed
        </h2>
        <ul className="result-rows">
          <li data-row="fed">
            <span aria-hidden="true">😋</span> Fed: <strong>{names(report.fed)}</strong>
          </li>
          {report.aches.length > 0 && (
            <li data-row="aches">
              <span aria-hidden="true">🤢</span> Tummy ache: <strong>{names(report.aches)}</strong>
            </li>
          )}
          {report.healed.length > 0 && (
            <li data-row="healed">
              <span aria-hidden="true">🩹</span> Nurse healed: <strong>{names(report.healed)}</strong> (stays one more wave)
            </li>
          )}
          {props.main && (
            <li data-row="hungry">
              <span aria-hidden="true">😢</span> Hungry today: <strong>{hungryOf(props.hungry, props.hungryAllowed)}</strong>
            </li>
          )}
          {props.main && props.hints !== undefined && (
            <li data-row="hints">
              <span aria-hidden="true">💡</span> Hints: <strong>{hintsText(props.hints.wave)}</strong> this wave, {hintsText(props.hints.today)} today
            </li>
          )}
          {props.main && (
            <li data-row="points">
              <span aria-hidden="true">⭐</span> Points: <strong>+{report.points}</strong>
            </li>
          )}
        </ul>
        <details className="result-more">
          <summary>What happened to each snack</summary>
          <ul className="lines">
            {wave.kids.map((k) => (
              <li key={`k${k.kid}`}>{kidLine(k, label(k.kid))}</li>
            ))}
            {wave.snacks.map((s, i) => (
              <li key={i}>
                {SNACK_EMOJI[s.snack]} {snackEndWords(s.end)}
              </li>
            ))}
          </ul>
        </details>
        {props.children}
      </div>
    </section>
  );
}
