import type { ReactElement } from 'react';

/**
 * Phase 0 placeholder screen. No game logic, no state, no Host yet: this exists
 * so the PWA can be installed on a phone and proved to work offline (Gate 0).
 *
 * Lane U owns this folder. When the Host arrives it is created in
 * src/platform (lane P) and passed in - this component never imports the sim.
 */
export function App(): ReactElement {
  return (
    <main className="screen">
      <h1>Nations</h1>
      <p className="lede">Phase 0 skeleton. No game here yet.</p>
      <ul className="facts">
        <li>The simulation runs as a pure package, ready for a Web Worker.</li>
        <li>The interface will reach it only through the Host interface.</li>
        <li>Rules and plan live in CLAUDE.md and docs/ROADMAP.md.</li>
      </ul>
      <p className="hint">
        Installed from a phone browser, this screen should also load with the network off.
      </p>
    </main>
  );
}
