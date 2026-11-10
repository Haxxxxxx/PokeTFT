"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAppStore } from "@/game/store/appStore";

/**
 * The one dialog in the app.
 *
 * Before this existed there were nine, each hand-rolled, and they agreed on
 * nothing: four backdrop opacities (black/70, /75, /80, /85), blur on some and
 * not others, p-4 vs p-5, and z-50 vs z-[80] vs z-[200]. Two of the nine set
 * role="dialog"; six of the nine closed on Escape; none restored focus. Two of
 * them — NewsModal and RankInfoModal — were character-identical for their first
 * ten lines, having been copied from one another.
 *
 * Three things here are not just deduplication:
 *
 * PORTALS. RecipeBook carried a comment explaining that a `fixed inset-0`
 * overlay gets trapped in the local stacking context of any transformed
 * ancestor, so the board's scaled canvas painted end-of-round banners on top of
 * it no matter what z-index it claimed. It fixed that for itself with a portal.
 * Every other dialog rendered from inside the match had the same latent bug and
 * no portal. Portaling here fixes the class, so a dialog's position in the tree
 * can no longer decide whether it is visible.
 *
 * FOCUS. Opening a dialog moves focus into it and closing returns focus to
 * whatever opened it. Without that, closing a dialog dropped focus to <body>
 * and keyboard users restarted from the top of the page every time.
 *
 * ESCAPE. Handled once, here, rather than in six of nine components.
 */
export function Modal({
  onClose,
  label,
  title,
  icon,
  size = "md",
  surface = "panel",
  padded = true,
  children,
  contentClassName = "",
}: {
  /** Called on Escape, backdrop click, and the close button. */
  onClose: () => void;
  /** Accessible name. Required — a dialog with no name is unusable on a screen reader. */
  label: string;
  /** Visible heading. Omit to render no header row and let `children` own the whole surface. */
  title?: ReactNode;
  /** Optional glyph shown left of the title. */
  icon?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** `panel` is the thin pre-game glass; `gilded` is the heavier in-match frame. */
  surface?: "panel" | "gilded";
  /** Set false when the content bleeds to the edges (a hero image, a full-width header). */
  padded?: boolean;
  children: ReactNode;
  contentClassName?: string;
}) {
  const lang = useAppStore((s) => s.settings.language);
  const closeLabel = lang === "fr" ? "Fermer" : "Close";

  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus in on open, and put it back where it came from on close.
  useEffect(() => {
    // Read before focusing: this effect runs before focus has moved anywhere, so
    // activeElement is still whatever opened the dialog. (Capturing it during
    // render instead would be a ref write in render, which React 19 forbids.)
    const back = document.activeElement;

    const first = surfaceRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (first ?? surfaceRef.current)?.focus({ preventScroll: true });

    return () => {
      if (back instanceof HTMLElement && document.contains(back)) {
        back.focus({ preventScroll: true });
      }
    };
  }, []);

  // Portals need a DOM. These dialogs are always opened by an interaction, so
  // they are never part of the prerendered HTML and this cannot mismatch.
  if (typeof document === "undefined") return null;

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        ref={surfaceRef}
        tabIndex={-1}
        className={`${surface} w-full ${width} max-h-[88vh] rounded-xl outline-none ${
          // Not combined: `overflow-y-auto` and `overflow-hidden` set overlapping
          // properties, and which wins would depend on stylesheet order rather
          // than on the order written here.
          padded ? "overflow-y-auto p-5" : "overflow-hidden flex flex-col"
        } ${contentClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.06]">
            {icon && <span className="text-gold-300">{icon}</span>}
            <h2 className="text-base font-extrabold gild-text flex-1">{title}</h2>
            <button
              onClick={onClose}
              aria-label={closeLabel}
              className="text-slate-500 hover:text-gold-300 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
