# Packaging PokéTFT as desktop (.exe / .dmg) + mobile (.apk)

PokéTFT ships as native apps via a **Tauri v2 thin shell**. The desktop and
mobile apps are tiny native webviews (~3–6 MB) that load the hosted game
(`https://poketft-arena.web.app`) on launch — see `src-tauri/shell/index.html`.

## Why a thin shell

The game is a static-export SPA where 100% of state + logic lives in Firebase —
it can't run offline (realtime multiplayer). So:

- **"Remote update" = `firebase deploy`.** Every desktop + mobile client gets the
  new web build instantly — no binary re-download, no Play Store resubmission.
- Binaries stay tiny — we do **not** bundle the ~19 MB of sprites/cries.
- One Tauri toolchain produces **both** desktop and Android targets.

The native wrapper itself rarely changes; you only rebuild it to change the
window chrome, icons, or native plugins.

## Build targets & where they're built

| Target | Build where | Command |
|---|---|---|
| macOS `.app` / `.dmg` | locally (this Mac) | `npm run tauri:build` |
| Android `.apk` | locally (Android SDK + NDK) | `npm run tauri:android` |
| Windows `.exe` / `.msi` | **GitHub Actions** (can't cross-build from macOS) | push a `app-v*` tag |

### Desktop (macOS, local)

```bash
npm run tauri:build
# → src-tauri/target/release/bundle/{dmg,macos}/
```

### Windows .exe (CI)

A Windows `.exe` cannot be built on macOS. Push a tag to trigger
`.github/workflows/tauri-build.yml`, which builds Windows + macOS and drafts a
GitHub Release with the installers:

```bash
git tag app-v0.1.0 && git push origin app-v0.1.0
```

### Android .apk (local)

Requires the Android SDK + NDK (already installed here) and these env vars:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
npm run tauri:android:init   # one-time: scaffolds src-tauri/gen/android
npm run tauri:android        # → src-tauri/gen/android/app/build/outputs/apk/
```

A release `.apk` must be signed before distribution (Play Store or sideload).

## ⚠️ Known caveat — Google sign-in in a webview

The app offers Google sign-in (`signInWithPopup`). Google **blocks OAuth inside
embedded webviews** (`disallowed_useragent`), which is what Tauri/Android
WebView are. So in the wrapped apps:

- ✅ Anonymous (guest) and email/password sign-in work normally.
- ❌ Google sign-in will likely fail in-app.

Fix options (future): open Google OAuth in the system browser via a deep-link
round-trip (tauri `opener` plugin + a custom URL scheme), or hide the Google
button when running inside the shell.

## Icons

`src-tauri/icons/*` are still the default Tauri placeholders. Generate branded
ones from a 1024×1024 PNG with: `npm run tauri icon path/to/icon.png`.
