# Gold AI v2 — Android APK Guide

This project is a TanStack Start web app. To package it as an Android APK, we use **Capacitor**.

## What is already configured

- `capacitor.config.ts` — Capacitor config pointing to `dist/client`.
- `public/manifest.json` — PWA manifest for the mobile app.
- `public/icons/icon-192.png` & `public/icons/icon-512.png` — App icons.
- `public/favicon.png` — Favicon.
- `scripts/build-mobile-html.js` — Generates a static `index.html` for Capacitor after the Vite build (TanStack Start produces SSR output by default, not a static SPA).
- `package.json` scripts:
  - `bun run build:mobile` — Build the web app and sync it into the Android project.
  - `bun run android` — Open Android Studio to build the APK.

## Prerequisites on your local machine

1. **Node.js + Bun** (or npm/yarn).
2. **Android Studio** with the Android SDK installed.
3. **Java 17** (or the JDK bundled with Android Studio).
4. Environment variable `ANDROID_HOME` set, e.g.:
   - macOS/Linux: `export ANDROID_HOME=$HOME/Android/Sdk`
   - Windows: `set ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk`

## Step-by-step: build the APK

### 1. Pull the code from GitHub

```bash
git clone https://github.com/aljradiaa-code/Gold-love-.git
cd Gold-love-
bun install
```

### 2. Add the Android platform (first time only)

```bash
bunx cap add android
```

This creates the `android/` folder. It is ignored by Git, so each new clone must run this step once.

### 3. Build and sync the web app into Android

```bash
bun run build:mobile
```

This command:
- Runs `vite build` (production web build).
- Runs `scripts/build-mobile-html.js` to create `dist/client/index.html`.
- Runs `npx cap sync android` to copy the web assets into `android/app/src/main/assets/public/`.

### 4. Open Android Studio and build the APK

```bash
bun run android
```

In Android Studio:
- Wait for Gradle sync.
- Choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
- The APK appears at `android/app/build/outputs/apk/debug/app-debug.apk`.

To sign a release APK, use **Build → Generate Signed Bundle / APK** and follow the prompts.

## Important notes

- **Do not commit the `android/` folder.** It is in `.gitignore` because it contains generated native code and SDK paths that are machine-specific.
- **Environment variables / secrets** (e.g. `LOVABLE_API_KEY`, `TwelveData API key`) are not exported with the code. You must copy them to your new hosting environment or keep them in Lovable.
- The live-trading feature uses `localStorage` and `fetch()` calls to `api.twelvedata.com`. Inside the WebView, these calls work as long as the device has internet access.

## Troubleshooting

- **No `dist/client/index.html` after build?** Run `node scripts/build-mobile-html.js` manually.
- **`npx cap add android` fails?** Check that `ANDROID_HOME` is set and that Android Studio is installed.
- **App shows blank screen on device?** Open Chrome DevTools (`chrome://inspect`) and check for CORS / network errors.
