"use client";

/** The hosted origin the native shell loads + bounces auth through. */
export const HOSTED_ORIGIN = "https://game-poketft-arena.web.app";

/** Path the Rust shell intercepts (on_navigation) to open the system browser. */
export const NATIVE_GOOGLE_SENTINEL = `${HOSTED_ORIGIN}/__native-google`;

/** True when running inside the Tauri desktop/mobile shell. The shell injects
 *  __POKETFT_SHELL__ via an initialization script (see src-tauri/src/lib.rs) —
 *  reliable even on a remote-loaded page, unlike the __TAURI__ IPC global. */
export function isNativeShell(): boolean {
  return typeof window !== "undefined" && (window as unknown as { __POKETFT_SHELL__?: boolean }).__POKETFT_SHELL__ === true;
}

/** Ask the shell to open the Google sign-in bridge in the SYSTEM browser.
 *  Navigating to the sentinel is caught by on_navigation in lib.rs, which opens
 *  the real browser and cancels this in-webview navigation. The result returns
 *  via the poketft:// deep link → window.__poketftNativeAuth. */
export function openNativeGoogleSignIn(): void {
  window.location.href = NATIVE_GOOGLE_SENTINEL;
}
