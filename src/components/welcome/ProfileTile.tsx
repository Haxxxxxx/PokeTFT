"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { getHistory, rankOf, START_RATING, type GameResult } from "@/game/net/users";
import { useT } from "@/lib/i18n";
import { Crown, Swords, ChevronRight } from "lucide-react";

/** Launcher profile tile — avatar, name, a couple of headline stats, and a tap-through
 *  to the full profile/history. Thin premium styling. */
export function ProfileTile() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const profile = useAuth((s) => s.profile);
  const setProfileOpen = useAppStore((s) => s.setProfileOpen);
  const [history, setHistory] = useState<GameResult[] | null>(null);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    getHistory(uid).then((h) => alive && setHistory(h)).catch(() => setHistory([]));
    return () => { alive = false; };
  }, [uid]);

  const { games, wins, best } = useMemo(() => {
    const h = history ?? [];
    return {
      games: h.length,
      wins: h.filter((g) => g.won || g.place === 1).length,
      best: h.length ? Math.min(...h.map((g) => g.place)) : null,
    };
  }, [history]);

  const name = profile?.username || user?.displayName || "Trainer";
  const photo = profile?.photoURL || user?.photoURL || null;

  return (
    <button
      onClick={() => setProfileOpen(true)}
      className="panel rounded-xl p-4 w-full text-left group hover:border-amber-500/25 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 rounded-xl bg-white/[0.03] border border-amber-500/25 flex items-center justify-center overflow-hidden shrink-0">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={56} height={56} style={{ imageRendering: "pixelated" }} />
          ) : (
            <span className="text-xl font-bold text-amber-200/70">{name.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold gild-text truncate">{name}</div>
          {(() => { const rank = rankOf(profile?.rating ?? START_RATING); return (
            <div className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: rank.color }}>
              {rank.label}<span className="text-slate-500 font-semibold">· {rank.lp} LP</span>
            </div>
          ); })()}
          <div className="text-[10px] text-slate-500 flex items-center gap-1">{t.pt_view} <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" /></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3.5">
        <Stat icon={<Swords size={13} />} label={t.pt_games} value={games} color="#cbd5e1" />
        <Stat icon={<Crown size={13} />} label={t.pt_wins} value={wins} color="#fbbf24" />
        <Stat icon={<ChevronRight size={13} />} label={t.pt_best} value={best ? `#${best}` : "—"} color="#34d399" />
      </div>
    </button>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] py-2 flex flex-col items-center gap-0.5">
      <span style={{ color }}>{icon}</span>
      <span className="text-sm font-extrabold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[8px] uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}
