import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    // Pre-bundle workbox packages so Vite doesn't trigger a full reload
    // when it discovers them at runtime during PWA service-worker registration.
    include: [
      'workbox-window',
      'workbox-precaching',
      'workbox-routing',
      'workbox-strategies',
      'workbox-core',
    ],
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Blend POS',
        short_name: 'BlendPOS',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        description: 'Sistema de Punto de Venta',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
