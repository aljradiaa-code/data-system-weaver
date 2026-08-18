/**
 * Post-build helper for Capacitor / Android APK.
 * TanStack Start produces an SSR bundle (no static index.html). For a mobile
 * WebView we generate a simple SPA entry that loads the built client assets.
 */
import fs from 'node:fs';
import path from 'node:path';

const clientDir = path.resolve('dist/client');
const assetsDir = path.join(clientDir, 'assets');

function findAsset(prefix, ext) {
  return fs.readdirSync(assetsDir).find((f) => f.startsWith(prefix) && f.endsWith(ext));
}

const indexJs = findAsset('index', '.js');
const stylesCss = findAsset('styles', '.css');

if (!indexJs || !stylesCss) {
  console.error('Missing built assets; run "vite build" first.');
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#03060d" />
    <title>Gold AI v2</title>
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <link rel="stylesheet" href="/assets/${stylesCss}" />
  </head>
  <body class="bg-[#03060d] text-[#c5d4e8] overscroll-none">
    <div id="root"></div>
    <script type="module" src="/assets/${indexJs}"></script>
  </body>
</html>
`;

fs.writeFileSync(path.join(clientDir, 'index.html'), html);
console.log('Generated dist/client/index.html for Capacitor.');
