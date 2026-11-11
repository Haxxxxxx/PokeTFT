"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

/** Keep a panel fully on screen — a restored position from a larger window, or
 *  a window resized under a panel, must not strand it off the edge. */
function clampToViewport(x: number, y: number, w: number, h: number) {
  const maxX = Math.max(0, window.innerWidth - w);
  const maxY = Math.max(0, window.innerHeight - h);
  return { x: Math.max(0, Math.min(maxX, x)), y: Math.max(0, Math.min(maxY, y)) };
}

/**
 * Makes a floating panel draggable anywhere on screen, and remembers where the
 * player left it.
 *
 * The round recap was pinned to the right of the round tracker, which is also
 * where the trainers rail, the detail popover and the shop controls want to
 * be — so on a narrow window it opened on top of something you were reading,
 * and the only way to see underneath was to close the thing you had just
 * opened. A panel that holds a snapshot of a past fight is exactly the kind of
 * thing you want to park somewhere and keep comparing against.
 *
 * Deliberately NOT dnd-kit. That context is for game pieces: it owns a
 * collision strategy tuned for the hexes, a DragOverlay, and drop targets that
 * sell or equip. Routing window chrome through it would put a panel into the
 * same ranking as a bench slot — including, on a bad frame, the sell zone.
 * Pointer events are the whole mechanism this needs.
 *
 * `defaultStyle` is used until the player drags; after that the panel is
 * positioned from left/top, so a default expressed as `right`/`bottom` works
 * for the un-dragged case without having to measure anything on mount.
 */
export function useDraggablePanel(storageKey: string, defaultStyle: CSSProperties) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  // Pointer offset INSIDE the panel at grab time. Without it the panel jumps so
  // its corner meets the cursor on the first move.
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  // Restore where it was last left, clamped — the window may be smaller now.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const p = JSON.parse(raw) as { x: number; y: number };
      if (typeof p?.x !== "number" || typeof p?.y !== "number") return;
      const box = nodeRef.current?.getBoundingClientRect();
      setPos(clampToViewport(p.x, p.y, box?.width ?? 0, box?.height ?? 0));
    } catch {
      // Private mode, blocked storage, corrupt entry — the default position is
      // always correct, so a failed restore is not worth reporting.
    }
  }, [storageKey]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    // Controls inside the panel keep working: a close button is a click, not a
    // handle. Anything that is not interactive is draggable.
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    const node = nodeRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    grab.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    setPos({ x: box.left, y: box.top });
    setDragging(true);
    e.preventDefault();
  }, []);

  // Listeners live on the window, not the node: a fast drag outpaces the
  // element, and a pointer that leaves it would otherwise drop the panel
  // mid-gesture.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const g = grab.current;
      const node = nodeRef.current;
      if (!g || !node) return;
      const box = node.getBoundingClientRect();
      setPos(clampToViewport(e.clientX - g.dx, e.clientY - g.dy, box.width, box.height));
    };
    const up = () => {
      setDragging(false);
      grab.current = null;
      setPos((p) => {
        if (p) {
          try { window.localStorage.setItem(storageKey, JSON.stringify(p)); } catch { /* see above */ }
        }
        return p;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, storageKey]);

  // A window that shrinks under a parked panel must not strand it off-screen.
  useEffect(() => {
    if (!pos) return;
    const onResize = () => {
      const box = nodeRef.current?.getBoundingClientRect();
      setPos((p) => (p ? clampToViewport(p.x, p.y, box?.width ?? 0, box?.height ?? 0) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  /** Put it back where it started — the escape hatch for a panel dragged
   *  somewhere unhelpful, and for a stored position from another layout. */
  const reset = useCallback(() => {
    setPos(null);
    try { window.localStorage.removeItem(storageKey); } catch { /* see above */ }
  }, [storageKey]);

  const style: CSSProperties = pos
    ? { position: "fixed", left: pos.x, top: pos.y, right: "auto", bottom: "auto", transform: "none" }
    : defaultStyle;

  return { nodeRef, style, onPointerDown, dragging, moved: pos !== null, reset };
}
