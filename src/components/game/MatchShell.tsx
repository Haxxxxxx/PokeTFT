"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftOpen, Users, X } from "lucide-react";
import { useGameLayout } from "./LayoutProvider";

/**
 * The in-game screen's zone geometry, as a slot container.
 *
 * Replaces the old fixed 1760x1190 canvas that was uniformly `transform:
 * scale()`d to fit — an approach that shrank text and hex tokens together until
 * neither was usable on a phone. Here each zone gets a real size from the
 * layout engine and the arrangement REFLOWS:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ top — stage/round tracker + timer        │
 *   ├────────┬────────────────────┬────────────┤
 *   │ traits │       BOARD        │  players   │
 *   │  rail  │                    │ (avatars)  │
 *   ├────────┴────────────────────┴────────────┤
 *   │ bench                                    │
 *   ├──────────────────────────────────────────┤
 *   │ shop — level · reroll · gold · 5 cards   │
 *   └──────────────────────────────────────────┘
 *
 * On a phone (compact) the traits rail becomes a left drawer and the players
 * rail narrows to a strip of avatars that expands into a right drawer, so the
 * board keeps the space instead of every element shrinking at once.
 */
export function MatchShell({
  top,
  leftRail,
  rightRail,
  rightStrip,
  board,
  bench,
  shop,
  combat,
}: {
  top: ReactNode;
  /** Traits (+ item stash). Becomes a left drawer when space is tight. */
  leftRail: ReactNode;
  /** Full player list — right rail, or the right drawer when compact. */
  rightRail: ReactNode;
  /** Always-visible condensed player avatars for compact. */
  rightStrip?: ReactNode;
  board: ReactNode;
  bench: ReactNode;
  shop: ReactNode;
  /** True during combat: on compact the bench and shop yield the screen so the
   *  full 8-row battlefield fits. */
  combat: boolean;
}) {
  const L = useGameLayout();
  const [openLeft, setOpenLeft] = useState(false);
  const [openRight, setOpenRight] = useState(false);

  // Leaving drawer mode (rotate, resize, external display) must not strand an
  // open overlay on a layout that now renders both rails inline. Adjusted during
  // render rather than in an effect, so the stale drawer never paints a frame.
  const [wasDrawers, setWasDrawers] = useState(L.railsAsDrawers);
  if (wasDrawers !== L.railsAsDrawers) {
    setWasDrawers(L.railsAsDrawers);
    if (!L.railsAsDrawers) {
      setOpenLeft(false);
      setOpenRight(false);
    }
  }

  const hideBottom = combat && L.hideBottomInCombat;

  return (
    <div
      className="tft-shell fixed inset-0 overflow-hidden flex flex-col"
      style={{ padding: L.pad, gap: L.gap }}
    >
      {/* ── Top: round tracker, stage/round, timer ── */}
      <div className="shrink-0 flex items-center" style={{ height: L.topH }}>
        {L.railsAsDrawers && (
          <button
            onClick={() => setOpenLeft(true)}
            aria-label="Open traits"
            className="shrink-0 mr-1.5 grid place-items-center rounded-lg bg-white/[0.06] border border-white/10 text-slate-300 active:bg-white/[0.12]"
            style={{ width: L.topH - 6, height: L.topH - 6 }}
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <div className="flex-1 min-w-0 h-full">{top}</div>
      </div>

      {/* ── Middle: traits · board · players ── */}
      <div className="flex-1 min-h-0 flex items-stretch" style={{ gap: L.gap }}>
        {!L.railsAsDrawers && (
          <div className="shrink-0 min-h-0 flex flex-col" style={{ width: L.leftRail, gap: L.gap }}>
            {leftRail}
          </div>
        )}

        {/* The board owns whatever is left. */}
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center relative">
          {board}
        </div>

        <div className="shrink-0 min-h-0" style={{ width: L.rightRail }}>
          {L.railsAsDrawers ? (
            <button
              onClick={() => setOpenRight(true)}
              aria-label="Open players"
              className="w-full h-full flex flex-col items-center gap-1 overflow-hidden rounded-lg bg-white/[0.03] border border-white/[0.07] py-1"
            >
              {rightStrip ?? <Users size={16} className="text-slate-400" />}
            </button>
          ) : (
            rightRail
          )}
        </div>
      </div>

      {/* ── Bottom: bench, then shop ── */}
      {!hideBottom && (
        <>
          <div className="shrink-0 flex justify-center" style={{ height: L.benchH }}>
            {bench}
          </div>
          <div className="shrink-0" style={{ height: L.shopH }}>
            {shop}
          </div>
        </>
      )}

      {/* ── Drawers (compact only) ── */}
      {L.railsAsDrawers && openLeft && (
        <Drawer side="left" onClose={() => setOpenLeft(false)} width={268}>
          {leftRail}
        </Drawer>
      )}
      {L.railsAsDrawers && openRight && (
        <Drawer side="right" onClose={() => setOpenRight(false)} width={268}>
          {rightRail}
        </Drawer>
      )}
    </div>
  );
}

function Drawer({
  side, width, onClose, children,
}: {
  side: "left" | "right";
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  // Escape closes, matching every other overlay in the match view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative h-full overflow-y-auto gilded p-2 flex flex-col gap-2 ${side === "left" ? "mr-auto drawer-in-left" : "ml-auto drawer-in-right"}`}
        style={{ width }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="self-end shrink-0 grid place-items-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-slate-300"
        >
          <X size={14} />
        </button>
        {children}
      </div>
    </div>
  );
}
