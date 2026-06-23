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

## Google sign-in in the shell — system-browser bridge

Google blocks OAuth inside embedded webviews, so the shell does **not** sign in
in-app. Instead it bounces through the real browser via a `poketft://` deep link:

1. In the shell, the "Sign in with Google" button calls
   `window.__TAURI__.opener.openUrl(".../native-auth")` → opens the **system
   browser** (`isNativeShell()` in `src/game/net/nativeShell.ts`).
2. The browser page `/native-auth` (`src/app/native-auth/page.tsx`) runs the
   normal Google redirect — works fine in a real browser — and redirects to
   `poketft://auth#id_token=...&access_token=...`.
3. Rust (`src-tauri/src/lib.rs`, `deep_link().on_open_url`) evals that URL into
   the webview, calling `window.__poketftNativeAuth(...)`.
4. The app finishes with `signInWithCredential(...)` (`authStore.init`).

Wiring: `tauri.conf.json` registers the `poketft` scheme + `withGlobalTauri`;
`capabilities/remote-auth.json` lets the hosted origin call `opener:open-url`.

### ⚠️ Deep-link registration requirements (for testing)

- **macOS:** the scheme only resolves for a **bundled app installed in
  `/Applications`**. Drag `PokéTFT.app` there before testing the bridge.
- **Android:** the intent filter is registered by the installed APK — just
  install and run.
- Anonymous (guest) + email/password sign-in work everywhere regardless.

## Icons

`src-tauri/icons/*` are still the default Tauri placeholders. Generate branded
ones from a 1024×1024 PNG with: `npm run tauri icon path/to/icon.png`.
