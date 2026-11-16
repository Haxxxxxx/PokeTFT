"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { computeGameLayout, type GameLayout } from "@/game/ui/layout";

/**
 * Publishes the responsive in-game layout to the whole tree.
 *
 * The old screen laid everything out on a fixed 1760x1190 canvas and scaled it
 * uniformly, so the board's tile size was a module constant. Now the tile is
 * derived from the live viewport, and every consumer (board, combat field,
 * bench, shop) reads it from here.
 */
const LayoutCtx = createContext<GameLayout | null>(null);

/** Server render and the first client paint must agree, so start from a fixed
 *  desktop-ish viewport and swap to the real one in an effect. */
const SSR_LAYOUT = computeGameLayout(1920, 1080);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const read = () => {
      // visualViewport, NOT window.innerHeight.
      //
      // On iOS Safari window.innerHeight is the LAYOUT viewport: it stays at
      // the full height while the URL bar is on screen, so the board was being
      // solved for more height than the player can actually see and the bottom
      // of it sat under the browser chrome. visualViewport is the part that is
      // really visible, and it is what changes as the bar collapses.
      //
      // Chromium keeps the two in step, which is why no amount of emulation
      // surfaces this — it only shows up on the device.
      const vv = window.visualViewport;
      setSize({
        w: Math.round(vv?.width ?? window.innerWidth),
        h: Math.round(vv?.height ?? window.innerHeight),
      });
    };
    read();

    // visualViewport tracks the browser chrome collapsing on mobile (URL bar
    // hide/show) which plain resize events miss, and it's what actually changes
    // the usable height on a phone.
    const vv = window.visualViewport;
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    vv?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      vv?.removeEventListener("resize", read);
    };
  }, []);

  const layout = useMemo(
    () => (size ? computeGameLayout(size.w, size.h) : SSR_LAYOUT),
    [size],
  );

  return <LayoutCtx.Provider value={layout}>{children}</LayoutCtx.Provider>;
}

/** The current responsive layout. Falls back to the SSR layout outside a
 *  provider so isolated components (previews, overlays) still render. */
export function useGameLayout(): GameLayout {
  return useContext(LayoutCtx) ?? SSR_LAYOUT;
}
