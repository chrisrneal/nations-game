import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { INK, LINE } from './palette.ts';

/**
 * Every picture in the game is one of these: an inline SVG in a 48-unit box,
 * outlined in the one ink colour (docs/ART.md). It holds no `<text>` and no
 * `<title>`, so a picture never puts a letter on the page (Kindy, RULES 11);
 * `label` names it for screen readers through `aria-label` instead.
 */
export function Svg(props: { kind: string; label?: string | undefined; className?: string | undefined; style?: CSSProperties | undefined; box?: string; line?: number; children: ReactNode }): ReactElement {
  const className = `art art-${props.kind}${props.className === undefined ? '' : ` ${props.className}`}`;
  const a11y = props.label === undefined ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': props.label };
  return (
    <svg className={className} style={props.style} viewBox={props.box ?? '0 0 48 48'} focusable="false" {...a11y}>
      <g stroke={INK} strokeWidth={props.line ?? LINE} strokeLinejoin="round" strokeLinecap="round">
        {props.children}
      </g>
    </svg>
  );
}

/** A soft white highlight, drawn without an outline. */
export function Shine(props: { d: string }): ReactElement {
  return <path d={props.d} fill="#ffffff" stroke="none" opacity={0.55} />;
}

/** The soft shadow under anything standing on the ground. */
export function Shadow(props: { cx?: number; cy?: number; rx?: number }): ReactElement {
  return <ellipse cx={props.cx ?? 24} cy={props.cy ?? 44} rx={props.rx ?? 14} ry={3} fill={INK} stroke="none" opacity={0.16} />;
}

/** A clip id that is safe inside `url(#...)`, from React's `useId`. */
export function clipId(raw: string, what: string): string {
  return `${what}-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
