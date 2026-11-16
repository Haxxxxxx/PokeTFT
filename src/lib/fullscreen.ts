/** Cross-browser fullscreen helpers. Browsers only allow entering fullscreen
 *  from a user gesture (a click/tap), so `enterFullscreen` is best-effort and
 *  silently no-ops if the request is rejected or unsupported. */

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/**
 * Can this browser put the page itself into fullscreen?
 *
 * iPhone Safari CANNOT, and never could: Element.requestFullscreen is not
 * implemented, and webkitRequestFullscreen exists only on <video>. Every call
 * below therefore resolved to `undefined` and did nothing at all — so the
 * button sat in the HUD doing nothing, on the one platform where the screen is
 * small enough for it to matter. Reported from a real iPhone as "the
 * fullscreen version doesn't work".
 *
 * There is no workaround in the page: the way to get a fullscreen game on iOS
 * is Add to Home Screen, which runs it as a standalone app with no browser
 * chrome at all. So the honest thing is to detect the gap and say so, rather
 * than keep offering a control that cannot work.
 */
export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FsEl;
  return typeof el.requestFullscreen === "function"
    || typeof el.webkitRequestFullscreen === "function";
}

/** Already running as an installed/standalone app — iOS home-screen or any
 *  browser's installed PWA. There is nothing to toggle in that case: there is
 *  no browser chrome left to hide. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true
    || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FsDoc;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

export function enterFullscreen(): void {
  if (typeof document === "undefined" || isFullscreen()) return;
  const el = document.documentElement as FsEl;
  try {
    const p = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
  } catch {
    /* unsupported or blocked — ignore */
  }
}

export function exitFullscreen(): void {
  if (typeof document === "undefined" || !isFullscreen()) return;
  const d = document as FsDoc;
  try {
    const p = document.exitFullscreen?.() ?? d.webkitExitFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function toggleFullscreen(): void {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}
