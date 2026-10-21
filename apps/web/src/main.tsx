import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createFeedback, createHost, createSpeech, installPrompt, startDevice, updates } from './platform/index.ts';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html is missing #root');

// The one Host for the app's lifetime; the interface reaches the sim only through it.
const host = createHost();
// Listen for the browser's install event from the start: it fires once, early.
const install = installPrompt();
// Long-press and pinch guards, and a request to keep the saves.
startDevice();
// Sound (gentle, muted per profile by a grown-up) and haptics where the phone has them.
const feedback = createFeedback();
// A new version waits quietly until someone taps Update at a calm moment.
const waiting = updates();
// Spoken Kindy hints, unless a grown-up turned them off.
const speech = createSpeech(() => feedback.prefs.voice);

createRoot(root).render(
  <StrictMode>
    <App host={host} install={install} feedback={feedback} speech={speech} updates={waiting} />
  </StrictMode>,
);
