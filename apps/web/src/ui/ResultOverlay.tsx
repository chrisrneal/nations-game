import type { ReactElement, ReactNode } from 'react';
import type { WaveResult } from '@snacks/contracts';
import { Icon } from './art/Icons.tsx';
import { SnackArt } from './art/Snack.tsx';
import { hintsText, hungryOf, kidLine, snackLines, waveReport, type ReportBoard } from './labels.ts';
import { UpdateNotice } from './UpdateNotice.tsx';

/**
 * What a wave did, laid over the board once its replay ends (RULES 7): who
 * was fed, who got a tummy ache, who the Nurse healed, hungry kids against
 * the allowance and the points earned. One button carries on.
 */
export function ResultOverlay(props: {
  wave: WaveResult;
  label: (kid: number) => string;
  /** The board, so the snack lines can say what a snack hit. */
  board: ReportBoard;
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
            <Icon className="row-icon" name="yum" /> Fed: <strong>{names(report.fed)}</strong>
          </li>
          {report.aches.length > 0 && (
            <li data-row="aches">
              <Icon className="row-icon" name="ache" /> Tummy ache: <strong>{names(report.aches)}</strong>
            </li>
          )}
          {report.healed.length > 0 && (
            <li data-row="healed">
              <Icon className="row-icon" name="plaster" /> Nurse healed: <strong>{names(report.healed)}</strong> (stays one more wave)
            </li>
          )}
          {props.main && (
            <li data-row="hungry">
              <Icon className="row-icon" name="sad" /> Hungry today: <strong>{hungryOf(props.hungry, props.hungryAllowed)}</strong>
            </li>
          )}
          {props.main && props.hints !== undefined && (
            <li data-row="hints">
              <Icon className="row-icon" name="bulb" /> Hints: <strong>{hintsText(props.hints.wave)}</strong> this wave, {hintsText(props.hints.today)} today
            </li>
          )}
          {props.main && (
            <li data-row="points">
              <Icon className="row-icon" name="star" /> Points: <strong>+{report.points}</strong>
            </li>
          )}
        </ul>
        <details className="result-more" open={report.aches.length > 0 || report.hungry.length > 0}>
          <summary>What happened to each snack</summary>
          <ul className="lines">
            {wave.kids.map((k) => (
              <li key={`k${k.kid}`}>{kidLine(k, label(k.kid))}</li>
            ))}
            {snackLines(wave, props.board, label).map((l, i) => (
              <li key={`s${i}`}>
                <SnackArt className="line-snack" snack={l.snack} /> {l.text}
              </li>
            ))}
          </ul>
        </details>
        <UpdateNotice />
        {props.children}
      </div>
    </section>
  );
}
