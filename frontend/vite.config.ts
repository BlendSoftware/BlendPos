import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  // Polling necesario para hot-reload en Docker sobre Windows
  // (los eventos inotify no se propagan correctamente via volúmenes)
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
    host: true,
    port: 5173,
  },
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
        name: 'BlendPOS',
        short_name: 'BlendPOS',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#228be6',
        background_color: '#ffffff',
        description: 'Sistema de Punto de Venta',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
