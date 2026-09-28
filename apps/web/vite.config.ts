import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * PWA config is lane P. Two things here matter beyond taste:
 * - `registerType: 'autoUpdate'`: the owner installs once and never has to think
 *   about versions; a new deploy replaces the cached app on next launch.
 * - the manifest must stay installable on iOS, which needs the apple-touch-icon
 *   in index.html as well as these icons.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Nations',
        short_name: 'Nations',
        description: 'Run a nation in a staged 2030 world.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1726',
        theme_color: '#0e1726',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  server: {
    // `npm run dev -- --host` prints a LAN address so a phone on the same
    // Wi-Fi can open it. See README.md.
    port: 5173,
  },
});
