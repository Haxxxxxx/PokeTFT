"use client";

import { useEffect, useState, type RefObject } from "react";

export type AnchoredPos = { top: number; right: number };

/**
 * Viewport-relative position for a trigger-anchored popover that gets PORTALED to
 * document.body. In-game HUD dropdowns (AugmentsBar, CoopPanel) live inside the
 * `tft-shell` game canvas, which is scaled via a CSS `transform` — and a `transform`
 * on an ancestor makes it the containing block for any `position: fixed` descendant,
 * silently trapping the dropdown inside that ancestor's local stacking context. Any
 * sibling overlay rendered OUTSIDE the transformed canvas (end-of-round banners, the
 * augment/carousel picker, toasts) then always paints on top of it regardless of its
 * z-index. Portaling to document.body escapes the transform, but loses the natural
 * `absolute` anchoring to the trigger button — this hook re-derives it as `fixed`
 * coordinates instead, re-measured on open and on resize/scroll so it tracks the
 * trigger through the game's responsive scale.
 */
export function useAnchoredPopover(triggerRef: RefObject<HTMLElement | null>, open: boolean): AnchoredPos | null {
  const [pos, setPos] = useState<AnchoredPos | null>(null);
  useEffect(() => {
    // No cleanup needed on close: callers gate rendering on `open`, so a stale
    // coordinate left over from the last time it was open is never read.
    if (!open) return;
    const measure = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, triggerRef]);
  return pos;
}
