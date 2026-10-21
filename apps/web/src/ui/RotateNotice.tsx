import type { ReactElement } from 'react';

/**
 * Snack Attack is an upright game (the manifest says portrait, but iOS can't
 * lock it, and a browser tab turns freely). On a phone turned on its side the
 * screen is covered with a picture of a phone turning upright (styles.css shows
 * it only then). It is a picture with no words, so a Kindy child can follow it
 * too; the game underneath is untouched and waits.
 */
export function RotateNotice(): ReactElement {
  return (
    <div className="rotate-notice" role="img" aria-label="Turn your phone upright" data-testid="rotate">
      <svg viewBox="0 0 120 120" className="rotate-pic" aria-hidden="true">
        <g className="rotate-phone">
          <rect x="44" y="14" width="32" height="56" rx="7" fill="#fff" stroke="#23262b" strokeWidth="4" />
          <rect x="50" y="22" width="20" height="34" rx="3" fill="#a7d96f" />
          <circle cx="60" cy="63" r="3" fill="#23262b" />
        </g>
        <path d="M20 96 Q 60 124 100 96" fill="none" stroke="#2f9e6e" strokeWidth="6" strokeLinecap="round" />
        <path d="M100 96 L 90 94 M100 96 L 98 106" fill="none" stroke="#2f9e6e" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
