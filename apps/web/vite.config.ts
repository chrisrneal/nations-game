import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * PWA config is lane P. Things here that matter beyond taste:
 * - `registerType: 'prompt'` (K13): a new deploy installs in the background and
 *   waits. The app says "a new version is ready" at a calm moment and the player
 *   taps Update; nothing reloads the page by itself, so a wave is never cut
 *   short. Untouched, the new version opens the next time the app is closed
 *   and launched.
 * - the manifest must stay installable on iOS, which needs the apple-touch-icon
 *   in index.html as well as these icons; the maskable icon has its own
 *   picture, shrunk into Android's safe circle (e2e/make-assets.ts).
 * - theme and background colours are the app's own cream (`--bg` in styles.css),
 *   so the status bar, the splash and the first paint all match.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-maskable-512.png'],
      manifest: {
        id: '/',
        name: 'Snack Attack',
        short_name: 'Snack Attack',
        description: 'A cute daily puzzle: place friends who throw snacks like chess pieces, and feed every hungry kid.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff8ec',
        theme_color: '#fff8ec',
        lang: 'en',
        categories: ['games', 'kids', 'education'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Every built file, the worker chunk included, so the app opens in airplane mode.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The iPhone launch screens are fetched once when the app is added to the Home Screen; no need to keep them in the offline cache.
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // The sim runs in a module Web Worker (src/platform/worker.ts). ES format lets
  // the worker share code-split chunks; module workers run on iOS 15+ and Android.
  worker: { format: 'es' },
  server: {
    // `npm run dev -- --host` prints a LAN address so a phone on the same
    // Wi-Fi can open it (README.md, "Installing it on your phone").
    port: 5173,
  },
});
