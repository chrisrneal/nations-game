import type { CSSProperties, ReactElement } from 'react';

/**
 * A picture (an emoji, until the art in build step 8) drawn by CSS from its
 * `data-pic` attribute, so the page holds no text for it at all: Kindy mode
 * shows no text in play (RULES 11), and the phone check proves it by finding
 * no text on the Kindy screens. `label` names it for screen readers.
 */
export function Pic(props: { glyph: string; label?: string; className?: string; style?: CSSProperties }): ReactElement {
  const className = `pic${props.className === undefined ? '' : ` ${props.className}`}`;
  return props.label === undefined ? (
    <span className={className} data-pic={props.glyph} style={props.style} aria-hidden="true" />
  ) : (
    <span className={className} data-pic={props.glyph} style={props.style} role="img" aria-label={props.label} />
  );
}
