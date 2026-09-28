import { createContext, useCallback, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { Sheet } from './Sheet.tsx';

/** What a why-sheet says about one number: what it is and where it comes from. */
export interface Why {
  readonly title: string;
  readonly value: string;
  /** One or two sentences: the breakdown, in plain words. */
  readonly text: string;
}

const WhyContext = createContext<(why: Why) => void>(() => undefined);

export function WhyProvider(props: { children: ReactNode }): ReactElement {
  const [why, setWhy] = useState<Why | null>(null);
  const close = useCallback(() => setWhy(null), []);
  return (
    <WhyContext.Provider value={setWhy}>
      {props.children}
      {why !== null && (
        <Sheet title={why.title} onClose={close} label={`Why: ${why.title}`}>
          <p className="why-value">{why.value}</p>
          <p className="why-text">{why.text}</p>
        </Sheet>
      )}
    </WhyContext.Provider>
  );
}

export function useWhy(): (why: Why) => void {
  return useContext(WhyContext);
}

/** A number the player can tap for its why-sheet. Every number in the game is one of these. */
export function Num(props: { why: Why; children?: ReactNode; className?: string }): ReactElement {
  const open = useWhy();
  return (
    <button type="button" className={`num ${props.className ?? ''}`} onClick={() => open(props.why)}>
      {props.children ?? props.why.value}
    </button>
  );
}
