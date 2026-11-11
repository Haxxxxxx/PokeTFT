"use client";

import { useDroppable } from "@dnd-kit/core";
import { getDef } from "@/game/data/mons";
import { TYPE_COLOR } from "@/game/ui";
import { pensionRailMetrics } from "@/game/ui/dock-metrics";
import { useGame, PENSION_COST, PENSION_ROUNDS, PENSION_OVERDUE_LIMIT } from "@/game/store/gameStore";
import { PokemonModelPreview } from "./PokemonModelPreview";
import { PawIcon } from "./icons";
import { useT } from "@/lib/i18n";

/**
 * The Pokémon Pension, docked in the right rail beneath the trainers ladder.
 *
 * It used to float over the board itself, pinned at `top-[18%]` on the right
 * edge. That put a drop target in the middle of the arena, where it competed
 * with the hexes for both space and attention, and it had to stay nearly
 * transparent to avoid covering the fight — so the one panel that is a timer
 * was the hardest panel to read. Nobody noticed a mon maturing because nobody
 * looked there.
 *
 * On the rail it has a column of its own: a real header, the mon's name and
 * star tier, and the countdown written out rather than implied by a number
 * stamped over the art. The rail is also where the OTHER thing you track over
 * several rounds already lives (the ladder), which is the honest grouping —
 * both answer "what is coming for me in a few turns".
 */
export function PensionDock({ interactive, railW, font }: { interactive: boolean; railW: number; font: number }) {
  // Sized against the rail, never a flat pixel count. See dock-metrics.ts: the
  // previous dock was a fixed 76px while the board around it scaled 2.7x, so
  // it was the one element whose apparent size depended on the window.
  const M = pensionRailMetrics(railW, font);
  const pension = useGame((state) => state.pension);
  const collectPension = useGame((state) => state.collectPension);
  const { setNodeRef, isOver } = useDroppable({
    id: "pension",
    disabled: !interactive || !!pension,
  });
  const t = useT();
  // A matured mon now returns to the bench on its own (see nextRound). So the
  // only way one is still sitting here READY is that the bench was full when it
  // tried — which is a problem the player has to act on, not a reward waiting
  // to be claimed. It is styled as a warning, and it says how long they have.
  const ready = !!pension && pension.roundsLeft <= 0;
  const blocked = ready && (pension?.overdue ?? 0) > 0;
  const fightsLeft = pension ? Math.max(0, PENSION_OVERDUE_LIMIT - (pension.overdue ?? 0) + 1) : 0;
  const def = pension ? getDef(pension.defId) : null;
  const dex = pension && def ? def.dex[Math.max(0, Math.min(2, pension.star - 1))] : null;
  const typeColor = def ? TYPE_COLOR[def.types[0]] : "#d6a64f";

  return (
    <div
      ref={setNodeRef}
      // A stable hook for tools/probe-combat-recap.mjs. The dock is otherwise
      // identified only by its own label, which is translated — so a probe
      // guessing at it matched the page body instead and cheerfully reported
      // the pension was 900px tall.
      data-panel="pension"
      title={!pension ? t.net_pension_title(PENSION_COST, PENSION_ROUNDS) : undefined}
      style={{ padding: M.pad }}
      className={`gilded shrink-0 w-full flex flex-col items-center gap-1 overflow-hidden rounded-xl border transition-all
        ${isOver
          ? "scale-[1.03] border-emerald-300 bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
          : blocked
            ? "border-rose-400/70 bg-rose-950/45 shadow-[0_0_18px_rgba(244,63,94,0.3)]"
            : ready
              ? "border-emerald-400/60 bg-emerald-950/30"
              : "border-white/[0.06]"}
        ${!pension && interactive ? "border-dashed text-gold-100/70" : "text-slate-100"}`}
    >
      <span
        style={{ fontSize: M.label }}
        // truncate because the compact rail is 48px wide and the label is
        // translated — "DAY CARE" is a character longer than "PENSION", and a
        // wrapped section header pushes the art out of the panel.
        className="w-full truncate text-center font-extrabold uppercase tracking-wider text-gold-200/75"
      >
        {t.net_pension}
      </span>
      {pension && def && dex !== null ? (
        <>
          <div
            className="relative grid w-full place-items-center rounded-lg"
            style={{ height: M.art, background: `radial-gradient(circle, ${typeColor}55, transparent 72%)` }}
          >
            <PokemonModelPreview
              dex={dex}
              alt={`${def.name} in the Pokémon Pension`}
              width={M.preview}
              height={M.preview}
              className={ready ? "" : "opacity-85"}
            />
          </div>
          {/* The name and star tier are new. The old dock showed the sprite and
              a bare number, which told you something was in there but not what
              you had paid for — and a 2★ in the pension is a very different
              decision from a 1★. */}
          <span style={{ fontSize: M.body }} className="w-full truncate text-center font-bold leading-tight text-slate-100">
            {def.name} <span className="text-gold-300">{"★".repeat(Math.max(1, Math.min(3, pension.star)))}</span>
          </span>
          {ready ? (
            <>
              <button
                type="button"
                onClick={collectPension}
                style={{ fontSize: M.button }}
                className={`w-full rounded-md px-1 py-1 font-extrabold leading-none text-slate-950 ${
                  blocked ? "bg-rose-400 hover:bg-rose-300" : "bg-emerald-400 hover:bg-emerald-300"
                }`}
              >
                {t.net_pension_collect}
              </button>
              {blocked && (
                <span style={{ fontSize: M.label }} className="text-center font-bold leading-tight text-rose-300">
                  {t.net_pension_blocked} · {t.net_pension_autosell(fightsLeft)}
                </span>
              )}
            </>
          ) : (
            <>
              {/* A bar, not just a count. The pension is the only thing in the
                  match that resolves on a schedule of its own, and "2 rounds"
                  read as static text next to a sprite; a bar that visibly
                  empties is what makes it register as a timer at a glance. */}
              <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold-400 transition-[width] duration-500"
                  style={{ width: `${Math.round((1 - Math.max(0, Math.min(1, pension.roundsLeft / PENSION_ROUNDS))) * 100)}%` }}
                />
              </div>
              <span style={{ fontSize: M.body }} className="text-center font-bold leading-tight text-gold-100/80">
                {t.net_pension_rounds(pension.roundsLeft)}
              </span>
            </>
          )}
        </>
      ) : (
        <>
          <span className={`leading-none text-gold-200/80 transition-transform ${isOver ? "scale-125" : ""}`}>
            <PawIcon size={M.icon} />
          </span>
          <span style={{ fontSize: M.body }} className="text-center leading-tight text-slate-400">
            {interactive ? `${t.net_pension_drop} · ${PENSION_COST} ◉` : t.net_pension_empty}
          </span>
          {interactive && (
            <span style={{ fontSize: M.label }} className="text-center leading-tight text-slate-500">
              {t.net_pension_rounds(PENSION_ROUNDS)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
