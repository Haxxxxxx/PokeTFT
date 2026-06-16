"use client";

import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/game/net/roomStore";
import { useGame } from "@/game/store/gameStore";
import { useAppStore } from "@/game/store/appStore";
import { GraduationCap, Check, X } from "lucide-react";

const DONE_KEY = "poketft_tutorial_done";

type Step = { key: string; en: string; fr: string };
const STEPS: Step[] = [
  { key: "buy", en: "Buy a Pokémon from the shop", fr: "Achète un Pokémon à la boutique" },
  { key: "deploy", en: "Drag one onto the hex board", fr: "Place-en un sur le plateau" },
  { key: "level", en: "Buy XP to level up (bigger board)", fr: "Achète de l'XP pour monter de niveau" },
];

/**
 * A learn-by-doing coach shown ONLY during a brand-new trainer's first match. It
 * watches live game state (read-only) and ticks each core action off as the player
 * performs it — buy, deploy, level. Completing all three (or Skip) sets a localStorage
 * flag so it never returns. Rendered as a fixed overlay OUTSIDE the scaled canvas so the
 * text stays full-size and legible (incl. landscape phones).
 */
export function FirstMatchCoach() {
  const lang = useAppStore((s) => s.settings.language);
  const phase = useRoom((s) => s.room?.meta?.phase);
  // Subscribe to the RAW units array (not the derived selectors, which are stable
  // function refs) so the checklist re-evaluates whenever the player's board changes.
  const units = useGame((s) => s.units);
  const level = useGame((s) => s.level);

  // Hidden for good once the player has graduated (or skipped). `null` = still reading
  // localStorage; render nothing until we know, to avoid a flash for veterans.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    let seen = false;
    try { seen = !!localStorage.getItem(DONE_KEY); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(seen);
  }, []);

  // Baseline level captured once (in an effect, never during render) so "level up"
  // means *they* leveled, not whatever the lobby started them at.
  const baseLevel = useRef<number | null>(null);
  useEffect(() => {
    if (baseLevel.current === null && typeof level === "number") baseLevel.current = level;
  }, [level]);

  // Sticky completion: once a step is satisfied it stays checked even if the player
  // moves a unit back to the bench.
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const onBoard = units.filter((u) => u.pos !== null).length;
    const owned = units.length;
    setDone((d) => {
      const next = { ...d };
      if (owned > 0) next.buy = true;
      if (onBoard > 0) next.deploy = true;
      if (baseLevel.current !== null && level > baseLevel.current) next.level = true;
      return (next.buy === d.buy && next.deploy === d.deploy && next.level === d.level) ? d : next;
    });
  }, [units, level]);

  if (dismissed !== false) return null;
  // Only surface during planning — combat/carousel have their own focus.
  if (phase && phase !== "planning") return null;

  const allDone = STEPS.every((s) => done[s.key]);
  const finish = () => {
    try { localStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="coach-in fixed left-3 bottom-3 z-[60] w-[240px] rounded-xl border border-amber-500/30 bg-slate-950/92 backdrop-blur shadow-xl shadow-black/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-400"><GraduationCap size={16} /></span>
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-200 flex-1">
          {lang === "fr" ? "Premiers pas" : "First steps"}
        </span>
        <button onClick={finish} title={lang === "fr" ? "Passer" : "Skip"} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {STEPS.map((s) => {
          const ok = !!done[s.key];
          return (
            <li key={s.key} className="flex items-start gap-2">
              <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${ok ? "bg-emerald-500 border-emerald-400 text-black" : "border-slate-600 text-transparent"}`}>
                <Check size={11} strokeWidth={3} />
              </span>
              <span className={`text-[11px] leading-snug ${ok ? "text-slate-500 line-through" : "text-slate-200"}`}>{lang === "fr" ? s.fr : s.en}</span>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <button onClick={finish} className="mt-2.5 w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-extrabold">
          {lang === "fr" ? "Compris, à moi de jouer !" : "Got it — I'm ready!"}
        </button>
      )}
    </div>
  );
}
