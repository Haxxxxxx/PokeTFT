"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { getHistory, type GameResult } from "@/game/net/users";
import { GEN_LABELS } from "@/game/data/generations";
import { ArrowLeft, Trophy, Medal, Swords, Crown } from "lucide-react";

/** Placement → accent colour (1st gold, top-half emerald, rest slate). */
function placeColor(place: number, players: number): string {
  if (place === 1) return "#fbbf24";
  if (place <= Math.ceil(players / 2)) return "#34d399";
  return "#94a3b8";
}

export function ProfileScreen() {
  const user = useAuth((s) => s.user);
  const profile = useAuth((s) => s.profile);
  const setProfileOpen = useAppStore((s) => s.setProfileOpen);
  const lang = useAppStore((s) => s.settings.language);
  const [history, setHistory] = useState<GameResult[] | null>(null);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    getHistory(uid).then((h) => { if (alive) setHistory(h); }).catch(() => setHistory([]));
    return () => { alive = false; };
  }, [uid]);

  const stats = useMemo(() => {
    const h = history ?? [];
    const games = h.length;
    const wins = h.filter((g) => g.won || g.place === 1).length;
    const top4 = h.filter((g) => g.place <= Math.ceil(g.players / 2)).length;
    const avg = games ? h.reduce((s, g) => s + g.place, 0) / games : 0;
    return { games, wins, top4, avg };
  }, [history]);

  const name = profile?.username || user?.displayName || "Trainer";
  const photo = profile?.photoURL || user?.photoURL || null;
  const tr = (en: string, fr: string) => (lang === "fr" ? fr : en);

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-3xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setProfileOpen(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold text-slate-200"
          >
            <ArrowLeft size={15} /> {tr("Back", "Retour")}
          </button>
          <h1 className="text-lg font-extrabold text-amber-200">{tr("Profile", "Profil")}</h1>
        </div>

        {/* Identity card */}
        <div className="gilded rounded-2xl p-4 flex items-center gap-4">
          <span className="w-16 h-16 rounded-xl bg-black/40 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" width={64} height={64} style={{ imageRendering: "pixelated" }} />
            ) : (
              <span className="text-2xl font-extrabold text-slate-500">{name.slice(0, 1).toUpperCase()}</span>
            )}
          </span>
          <div className="min-w-0">
            <div className="text-xl font-extrabold text-slate-100 truncate">{name}</div>
            <div className="text-[11px] text-slate-500">{user?.isAnonymous ? tr("Guest account", "Compte invité") : user?.email}</div>
          </div>
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-4 gap-2">
          <StatCard icon={<Swords size={15} />} label={tr("Games", "Parties")} value={stats.games} color="#cbd5e1" />
          <StatCard icon={<Crown size={15} />} label={tr("Wins", "Victoires")} value={stats.wins} color="#fbbf24" />
          <StatCard icon={<Medal size={15} />} label={tr("Top half", "Top moitié")} value={stats.top4} color="#34d399" />
          <StatCard icon={<Trophy size={15} />} label={tr("Avg place", "Place moy.")} value={stats.games ? stats.avg.toFixed(1) : "—"} color="#38bdf8" />
        </div>

        {/* History list */}
        <div className="gilded rounded-2xl p-3">
          <h2 className="text-[10px] uppercase tracking-widest text-amber-200/60 font-bold mb-2 px-1">{tr("Match history", "Historique")}</h2>
          {history === null ? (
            <p className="text-[12px] text-slate-500 py-6 text-center">{tr("Loading…", "Chargement…")}</p>
          ) : history.length === 0 ? (
            <p className="text-[12px] text-slate-600 py-6 text-center">{tr("No games yet — play a match!", "Aucune partie — lance une partie !")}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {history.map((g) => {
                const color = placeColor(g.place, g.players);
                const regions = g.regions?.map((r) => (GEN_LABELS[r] ?? `Gen ${r}`).split("—")[1]?.trim() ?? `Gen ${r}`).join(", ");
                return (
                  <div key={g.code} className="flex items-center gap-3 px-2.5 py-2 rounded-lg bg-slate-900/60 border border-slate-800">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-sm shrink-0" style={{ background: `${color}22`, color, border: `1px solid ${color}66` }}>
                      #{g.place}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-slate-200 truncate">
                        {g.place === 1 ? tr("Victory", "Victoire") : tr(`Placed ${g.place} of ${g.players}`, `${g.place}ᵉ sur ${g.players}`)}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{regions}</div>
                    </div>
                    {typeof g.ts === "number" && (
                      <span className="text-[10px] text-slate-600 shrink-0">{new Date(g.ts).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric" })}</span>
                    )}
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="gilded rounded-xl p-2.5 flex flex-col items-center gap-0.5">
      <span style={{ color }}>{icon}</span>
      <span className="text-lg font-extrabold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-slate-500 text-center leading-tight">{label}</span>
    </div>
  );
}
