"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the OS "reduce motion" preference, live. CSS `@media (prefers-reduced-motion)`
 * handles declarative animations/transitions, but JS-driven motion (e.g. the combat
 * projectile bolts whose position is re-rendered every RAF frame) can only be gated in
 * JS — that's what this hook is for. SSR-safe: starts `false` until the effect runs.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
