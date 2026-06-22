"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { getLeaderboard, rankOf, type LeaderEntry } from "@/game/net/users";
import { RankInfoModal } from "./RankInfoModal";
import { ArrowLeft, Trophy, HelpCircle } from "lucide-react";

export function LeaderboardScreen() {
  const myUid = useAuth((s) => s.user?.uid);
  const setLeaderboardOpen = useAppStore((s) => s.setLeaderboardOpen);
  const openUserProfile = useAppStore((s) => s.openUserProfile);
  const lang = useAppStore((s) => s.settings.language);
  const [rows, setRows] = useState<LeaderEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(null); setFailed(false);
    getLeaderboard(100).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [reloadKey]);

  const tr = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const rankColor = (i: number) => (i === 0 ? "#fbbf24" : i === 1 ? "#cbd5e1" : i === 2 ? "#d97706" : "#64748b");

  return (
    <div className="min-h-screen w-full app-bg flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-xl flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setLeaderboardOpen(false)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-sm font-bold text-slate-200">
            <ArrowLeft size={15} /> {tr("Back", "Retour")}
          </button>
          <h1 className="text-lg font-bold text-amber-200 inline-flex items-center gap-2"><Trophy size={18} className="text-amber-400" /> {tr("Leaderboard", "Classement")}</h1>
          <button onClick={() => setShowInfo(true)} aria-label={tr("How ranks work", "Fonctionnement des rangs")} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-xs font-bold text-slate-300">
            <HelpCircle size={14} /> {tr("Ranks", "Rangs")}
          </button>
        </div>

        <div className="panel rounded-xl p-3">
          {failed ? (
            <div className="py-8 flex flex-col items-center gap-3">
              <p className="text-[12px] text-rose-400 text-center">{tr("Couldn't load the leaderboard.", "Échec du chargement du classement.")}</p>
              <button onClick={() => setReloadKey((k) => k + 1)} className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200">{tr("Retry", "Réessayer")}</button>
            </div>
          ) : rows === null ? (
            <p className="text-[12px] text-slate-500 py-8 text-center">{tr("Loading…", "Chargement…")}</p>
          ) : rows.length === 0 ? (
            <p className="text-[12px] text-slate-600 py-8 text-center">{tr("No ranked games yet — play a match!", "Aucune partie classée — lance une partie !")}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {rows.map((r, i) => {
                const rank = rankOf(r.rating);
                const me = r.uid === myUid;
                return (
                  <button key={r.uid} onClick={() => openUserProfile(r.uid)} className={`w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-lg border transition-colors ${me ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15" : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05]"}`}>
                    <span className="w-7 text-center font-extrabold text-sm tabular-nums" style={{ color: rankColor(i) }}>{i + 1}</span>
                    <span className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center overflow-hidden shrink-0">
                      {r.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photoURL} alt="" width={32} height={32} style={{ imageRendering: "pixelated" }} />
                      ) : <span className="text-xs font-bold text-slate-500">{r.username.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13px] font-bold truncate ${me ? "text-amber-300" : "text-slate-200"}`}>{r.username}</span>
                      <span className="text-[10px] font-bold" style={{ color: rank.color }}>{rank.label}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[13px] font-extrabold tabular-nums" style={{ color: rank.color }}>{rank.lp}<span className="text-[9px] text-slate-500 font-semibold"> LP</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {showInfo && <RankInfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
