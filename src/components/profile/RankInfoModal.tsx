"use client";

import { useAppStore } from "@/game/store/appStore";
import { RANK_TIERS, RATING_PER_DIV, MASTER_COLOR, START_RATING, ratingDelta, rankOf } from "@/game/net/users";
import { TrendingUp, X } from "lucide-react";

/** Explains the ranked ladder: the tiers, how LP/divisions work, and how a game's
 *  placement moves your rating. Opened from the leaderboard. */
export function RankInfoModal({ onClose }: { onClose: () => void }) {
  const lang = useAppStore((s) => s.settings.language);
  const tr = (en: string, fr: string) => (lang === "fr" ? fr : en);

  // Ladder, highest first: Master (apex) then Diamond…Iron. Each tier spans 4 divisions
  // (IV→I) of RATING_PER_DIV each, so a tier's floor = index * 4 * RATING_PER_DIV.
  const tiers = RANK_TIERS.map((t, i) => ({ ...t, floor: i * 4 * RATING_PER_DIV }));
  const start = rankOf(START_RATING);

  // Placement → LP for a full 8-player lobby (humans only count).
  const sample = Array.from({ length: 8 }, (_, i) => ({ place: i + 1, lp: ratingDelta(i + 1, 8) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={tr("Ranks", "Rangs")}>
      <div className="panel w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.06]">
          <span className="text-amber-400"><TrendingUp size={18} /></span>
          <h2 className="text-base font-extrabold gild-text flex-1">{tr("Ranks & how to climb", "Rangs & progression")}</h2>
          <button onClick={onClose} aria-label={tr("Close", "Fermer")} className="text-slate-500 hover:text-amber-300"><X size={18} /></button>
        </div>

        {/* The ladder */}
        <div className="flex flex-col gap-1 mb-4">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.07]">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: MASTER_COLOR }} />
            <span className="font-bold text-[13px] flex-1" style={{ color: MASTER_COLOR }}>{tr("Master", "Maître")}</span>
            <span className="text-[10px] text-slate-500 tabular-nums">{4 * RANK_TIERS.length * RATING_PER_DIV}+ {tr("rating", "points")}</span>
          </div>
          {[...tiers].reverse().map((t) => (
            <div key={t.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
              <span className="font-bold text-[13px] flex-1" style={{ color: t.color }}>{t.name}</span>
              <span className="text-[10px] text-slate-500">{tr("IV → I", "IV → I")}</span>
            </div>
          ))}
        </div>

        {/* How it works */}
        <ul className="flex flex-col gap-2 text-[12px] text-slate-300 leading-snug mb-4">
          <li className="flex gap-2"><span className="text-amber-400">•</span>{tr(
            `Each tier has 4 divisions (IV → I). A division is ${RATING_PER_DIV} LP.`,
            `Chaque palier a 4 divisions (IV → I). Une division vaut ${RATING_PER_DIV} LP.`)}</li>
          <li className="flex gap-2"><span className="text-emerald-400">•</span>{tr(
            `Reach ${RATING_PER_DIV} LP to promote to the next division — or the next tier from I.`,
            `Atteins ${RATING_PER_DIV} LP pour passer à la division suivante — ou au palier suivant depuis I.`)}</li>
          <li className="flex gap-2"><span className="text-rose-400">•</span>{tr(
            "Drop below 0 LP in a division and you demote.",
            "Tombe sous 0 LP dans une division et tu es rétrogradé.")}</li>
          <li className="flex gap-2"><span className="text-sky-400">•</span>{tr(
            "LP comes from your finish: the top half of the lobby gains, the bottom half loses — bigger swings in bigger lobbies.",
            "Les LP dépendent de ton classement : la moitié haute gagne, la moitié basse perd — plus l'écart est grand, plus le gain/la perte est forte.")}</li>
          <li className="flex gap-2"><span className="text-violet-400">•</span>{tr(
            "Bots count too, but for less — a practice game vs AI moves your LP slowly, a full human lobby moves it fully. Everyone starts at",
            "Les IA comptent aussi, mais moins — une partie d'entraînement contre l'IA bouge tes LP lentement, un lobby plein de joueurs les bouge pleinement. Tout le monde commence à")} <b style={{ color: start.color }}>{start.label}</b>.</li>
        </ul>

        {/* Placement → LP example */}
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-amber-200/60 font-bold mb-2">{tr("Example — 8 players", "Exemple — 8 joueurs")}</h3>
          <div className="grid grid-cols-4 gap-1.5">
            {sample.map((s) => (
              <div key={s.place} className="flex flex-col items-center py-1.5 rounded-md bg-white/[0.02] border border-white/[0.05]">
                <span className="text-[11px] font-bold text-slate-300">#{s.place}</span>
                <span className={`text-[12px] font-extrabold tabular-nums ${s.lp >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{s.lp >= 0 ? "+" : ""}{s.lp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
