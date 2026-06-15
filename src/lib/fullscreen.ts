/** Cross-browser fullscreen helpers. Browsers only allow entering fullscreen
 *  from a user gesture (a click/tap), so `enterFullscreen` is best-effort and
 *  silently no-ops if the request is rejected or unsupported. */

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

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
