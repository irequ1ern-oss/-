import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// На GitHub Pages сайт живёт не в корне, а в папке с именем репозитория (например /-/).
// Путь подставляет GitHub Actions через BASE_PATH; локально сайт открывается из корня.
const base = process.env.BASE_PATH || '/';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base,
  build: {
    rolldownOptions: {
      // Приложение + страницы превью дизайна (preview/ — не кешируются для офлайна).
      input: {
        main: page('./index.html'),
        preview: page('./preview/index.html'),
        previewApp: page('./preview/app.html'),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    preact(),
    VitePWA({
      // Новая версия ставится сама и включается при следующем открытии приложения.
      registerType: 'prompt',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Учёба',
        short_name: 'Учёба',
        description: 'Расписание пар, ДЗ и заметки',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f6f9',
        theme_color: '#2563eb',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        // Превью дизайна всегда грузится из сети и не попадает в офлайн-кеш приложения.
        globIgnores: ['preview/**'],
        navigateFallbackDenylist: [/\/preview\//],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
