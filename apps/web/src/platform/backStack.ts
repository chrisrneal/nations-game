/**
 * The Back button (decision record K12). On Android Chrome, Back from the
 * installed app leaves the app, which a child would do by accident with a sheet
 * open. Every sheet and overlay therefore registers here when it opens: that
 * pushes one history entry, so Back pops it and closes the top sheet instead.
 * Closing a sheet any other way (its X, a swipe, a tap outside) takes its
 * entry back out. With nothing open, Back is the browser's own.
 *
 * The history entries are all the same page, so they are interchangeable: it
 * does not matter which one a close removes, only that the count matches.
 */
export interface BackStack {
  /** A sheet opened. `close` is called when Back is pressed. Returns what to call when it closes by itself. */
  open(close: () => void): () => void;
  /** How many sheets are open. */
  readonly depth: number;
}

/** What the browser's history provides, so tests can stand in for it. */
export interface BackEnv {
  push(): void;
  back(): void;
  onPop(listener: () => void): void;
}

function browserEnv(): BackEnv {
  return {
    push: () => window.history.pushState({ snackSheet: true }, ''),
    back: () => window.history.back(),
    onPop: (listener) => window.addEventListener('popstate', listener),
  };
}

export function createBackStack(env: BackEnv = browserEnv()): BackStack {
  const open: { close: () => void }[] = [];
  /** Pops we caused ourselves and must not treat as a person's Back press. */
  let ours = 0;
  let listening = false;

  const onPop = (): void => {
    if (ours > 0) {
      ours -= 1;
      return;
    }
    open.pop()?.close();
  };

  return {
    get depth() {
      return open.length;
    },
    open(close) {
      if (!listening) {
        listening = true;
        try {
          env.onPop(onPop);
        } catch {
          // No history events: sheets close their usual ways only.
        }
      }
      const entry = { close };
      open.push(entry);
      try {
        env.push();
      } catch {
        // No history to push to: Back then behaves as the browser's.
      }
      return () => {
        const at = open.indexOf(entry);
        if (at < 0) return;
        open.splice(at, 1);
        ours += 1;
        try {
          env.back();
        } catch {
          ours -= 1;
        }
      };
    },
  };
}
