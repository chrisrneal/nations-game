import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createHost, installPrompt } from './platform/index.ts';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html is missing #root');

// The one Host for the app's lifetime; the interface reaches the sim only through it.
const host = createHost();
// Listen for the browser's install event from the start: it fires once, early.
const install = installPrompt();

createRoot(root).render(
  <StrictMode>
    <App host={host} install={install} />
  </StrictMode>,
);
