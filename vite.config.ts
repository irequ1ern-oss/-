import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// На GitHub Pages сайт живёт не в корне, а в папке с именем репозитория (например /-/).
// Путь подставляет GitHub Actions через BASE_PATH; локально сайт открывается из корня.
const base = process.env.BASE_PATH || '/';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Папка сборки (её узнаём у Vite: её можно поменять флагом --outDir).
let outDir = page('./dist');
const rememberOutDir: Plugin = {
  name: 'ucheba:out-dir',
  configResolved(config) {
    outDir = resolve(config.root, config.build.outDir);
  },
};

interface ManifestChunk {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

/**
 * Файлы из assets/, которые реально нужны приложению (index.html и всё, что он подгружает).
 * Скрипты и стили превью дизайна сюда не попадают — в офлайн-кеш приложения их класть незачем.
 */
function appAssets(): Set<string> | null {
  const path = resolve(outDir, '.vite/manifest.json');
  if (!existsSync(path)) return null;
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, ManifestChunk>;
  // Без этого кеш молча остался бы без скриптов, и приложение не открылось бы без сети — лучше сломать сборку.
  if (!manifest['index.html']) throw new Error('ucheba: в .vite/manifest.json нет index.html — офлайн-кеш собрать нельзя');
  const files = new Set<string>();
  const seen = new Set<string>();
  const visit = (key: string) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    files.add(chunk.file);
    chunk.css?.forEach((f) => files.add(f));
    chunk.assets?.forEach((f) => files.add(f));
    [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])].forEach(visit);
  };
  visit('index.html');
  return files;
}

// Страницы превью нельзя «установить» как приложение: убираем из них ссылку на манифест.
const previewWithoutManifest: Plugin = {
  name: 'ucheba:preview-without-manifest',
  // После плагина PWA: он сам добавляет ссылку на манифест в каждую страницу.
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      return ctx.path.includes('/preview/') ? html.replace(/\s*<link rel="manifest"[^>]*>/, '') : html;
    },
  },
};

export default defineConfig({
  base,
  build: {
    // Карта сборки (.vite/manifest.json): по ней офлайн-кеш берёт только файлы приложения.
    manifest: true,
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
    rememberOutDir,
    preact(),
    VitePWA({
      // Новая версия скачивается и включается сама (skipWaiting ниже); приложение предлагает перезагрузить экран.
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
        // Цвет фона светлой темы (--bg): заставка при запуске и полоса сверху до загрузки приложения.
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
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
        // И /preview/…, и /preview без косой черты (иначе service worker откроет вместо превью приложение).
        navigateFallbackDenylist: [/\/preview(?:[/?]|$)/],
        manifestTransforms: [
          async (entries) => {
            const keep = appAssets();
            if (!keep) return { manifest: entries, warnings: ['ucheba: нет .vite/manifest.json, кешируется всё'] };
            return { manifest: entries.filter((e) => !e.url.startsWith('assets/') || keep.has(e.url)), warnings: [] };
          },
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
    previewWithoutManifest,
  ],
});
