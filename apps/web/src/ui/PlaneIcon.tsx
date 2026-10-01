import type { ReactElement } from 'react';

/** A plane seen from above, nose to the right. Drawn for this game; no icon set. */
export function PlaneIcon(props: { className?: string }): ReactElement {
  return (
    <svg className={props.className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M30 16 24 14h-5L13 4h-3l4 10H6L3 11H1l2 5-2 5h2l3-3h8l-4 10h3l6-10h5z" fill="currentColor" />
    </svg>
  );
}
