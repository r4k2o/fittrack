import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  base: '/fittrack/', // must equal the GitHub repository name
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Fittrack',
        short_name: 'Fittrack',
        description: 'A private logbook for food, training and body weight. Your data stays on this phone.',
        display: 'standalone', // standalone keeps the Home Screen exemption from Safari's 7-day data removal
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        background_color: '#0b0b0c',
        theme_color: '#0b0b0c',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // also cache the barcode decoder (.wasm) and the food list (.json)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
})
