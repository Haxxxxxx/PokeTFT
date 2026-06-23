"use client";

/** The hosted origin the native shell loads + bounces auth through. */
export const HOSTED_ORIGIN = "https://poketft-arena.web.app";

/** True when running inside the Tauri desktop/mobile shell (vs a normal browser).
 *  Tauri injects __TAURI_INTERNALS__ into every webview it controls. */
export function isNativeShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type TauriGlobal = { opener?: { openUrl?: (url: string) => Promise<void> } };

/** Open a URL in the SYSTEM browser via the Tauri opener global. Used for the
 *  Google sign-in bridge — Google blocks OAuth inside embedded webviews, so we
 *  bounce out to the real browser and back via the poketft:// deep link. */
export async function openInSystemBrowser(url: string): Promise<void> {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  if (tauri?.opener?.openUrl) {
    await tauri.opener.openUrl(url);
    return;
  }
  // Fallback (e.g. global not injected): a normal new-tab open.
  window.open(url, "_blank", "noopener");
}
