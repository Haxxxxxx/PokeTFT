"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { getLeaderboard, rankOf, type LeaderEntry } from "@/game/net/users";
import { ArrowLeft, Trophy } from "lucide-react";

export function LeaderboardScreen() {
  const myUid = useAuth((s) => s.user?.uid);
  const setLeaderboardOpen = useAppStore((s) => s.setLeaderboardOpen);
  const lang = useAppStore((s) => s.settings.language);
  const [rows, setRows] = useState<LeaderEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    getLeaderboard(100).then((r) => alive && setRows(r)).catch(() => setRows([]));
    return () => { alive = false; };
  }, []);

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
        </div>

        <div className="panel rounded-2xl p-3">
          {rows === null ? (
            <p className="text-[12px] text-slate-500 py-8 text-center">{tr("Loading…", "Chargement…")}</p>
          ) : rows.length === 0 ? (
            <p className="text-[12px] text-slate-600 py-8 text-center">{tr("No ranked games yet — play a match!", "Aucune partie classée — lance une partie !")}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {rows.map((r, i) => {
                const rank = rankOf(r.rating);
                const me = r.uid === myUid;
                return (
                  <div key={r.uid} className={`flex items-center gap-3 px-2.5 py-2 rounded-lg border ${me ? "bg-amber-500/10 border-amber-500/30" : "bg-white/[0.02] border-white/[0.05]"}`}>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
