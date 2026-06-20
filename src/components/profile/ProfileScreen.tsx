"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { getHistory, getProfile, rankOf, START_RATING, type GameResult, type UserProfile } from "@/game/net/users";
import { GEN_LABELS } from "@/game/data/generations";
import { getDef, spriteUrl } from "@/game/data/mons";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { TraitGlyph } from "@/components/game/TraitGlyph";
import { TYPE_COLOR } from "@/game/ui";
import { computeAchievements, ACHIEVEMENT_TIER_COLOR } from "@/game/data/achievements";
import { ArrowLeft, Trophy, Medal, Swords, Crown, X } from "lucide-react";

/** Placement → accent colour (1st gold, top-half emerald, rest slate). */
function placeColor(place: number, players: number): string {
  if (place === 1) return "#fbbf24";
  if (place <= Math.ceil(players / 2)) return "#34d399";
  return "#94a3b8";
}

export function ProfileScreen() {
  const user = useAuth((s) => s.user);
  const myProfile = useAuth((s) => s.profile);
  const setProfileOpen = useAppStore((s) => s.setProfileOpen);
  const viewUid = useAppStore((s) => s.viewProfileUid);
  const lang = useAppStore((s) => s.settings.language);
  const [history, setHistory] = useState<GameResult[] | null>(null);
  const [selected, setSelected] = useState<GameResult | null>(null);

  // Whose profile are we showing? viewUid (a leaderboard row / friend) overrides self.
  const isOther = !!viewUid && viewUid !== user?.uid;
  const uid = viewUid ?? user?.uid;
  // For another user, pull their public profile node; for self, use the live auth store.
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [otherLoaded, setOtherLoaded] = useState(false);
  const profile = isOther ? otherProfile : myProfile;

  useEffect(() => {
    if (!isOther || !uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOtherProfile(null); setOtherLoaded(false);
      return;
    }
    let alive = true;
    setOtherLoaded(false);
    getProfile(uid)
      .then((p) => { if (alive) { setOtherProfile(p); setOtherLoaded(true); } })
      .catch(() => { if (alive) { setOtherProfile(null); setOtherLoaded(true); } });
    return () => { alive = false; };
  }, [isOther, uid]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(null);
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

  const achievements = useMemo(
    () => computeAchievements({ games: stats.games, wins: stats.wins, topHalf: stats.top4, rating: profile?.rating ?? START_RATING, history: history ?? [] }),
    [stats, profile?.rating, history],
  );
  const earnedCount = achievements.filter((a) => a.earned).length;

  const name = profile?.username || (isOther ? "" : user?.displayName) || "Trainer";
  const photo = profile?.photoURL ?? (isOther ? null : user?.photoURL) ?? null;
  const tr = (en: string, fr: string) => (lang === "fr" ? fr : en);
  // Still loading another user's public profile node (vs loaded-but-missing).
  const loadingOther = isOther && !otherLoaded;
  const missingOther = isOther && otherLoaded && !otherProfile;

  return (
    <div className="min-h-screen w-full app-bg flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-xl flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setProfileOpen(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold text-slate-200"
          >
            <ArrowLeft size={15} /> {tr("Back", "Retour")}
          </button>
          <h1 className="text-lg font-extrabold text-amber-200">{isOther ? tr("Trainer profile", "Profil du dresseur") : tr("Profile", "Profil")}</h1>
        </div>

        {/* Identity card */}
        <div className="panel rounded-2xl p-4 flex items-center gap-3.5">
          <span className="w-16 h-16 rounded-xl bg-white/[0.03] border border-amber-500/25 flex items-center justify-center overflow-hidden shrink-0">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" width={64} height={64} style={{ imageRendering: "pixelated" }} />
            ) : (
              <span className="text-2xl font-bold text-amber-200/70">{name.slice(0, 1).toUpperCase()}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold gild-text truncate">{loadingOther ? "…" : missingOther ? tr("Unavailable", "Indisponible") : name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{missingOther ? tr("This trainer's profile couldn't be loaded.", "Profil introuvable.") : isOther ? (profile?.currentGame ? tr("In a game", "En partie") : tr("Trainer", "Dresseur")) : user?.email}</div>
          </div>
          {(() => {
            const rank = rankOf(profile?.rating ?? START_RATING);
            return (
              <div className="text-right shrink-0 w-32">
                <div className="text-sm font-extrabold" style={{ color: rank.color }}>{rank.label}</div>
                <div className="text-[10px] text-slate-400 tabular-nums">{rank.lp} {rank.apex ? "LP" : `/ ${rank.lpMax} LP`}</div>
                {!rank.apex && (
                  <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(rank.lp / rank.lpMax) * 100}%`, background: rank.color }} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-4 gap-2">
          <StatCard icon={<Swords size={15} />} label={tr("Games", "Parties")} value={stats.games} color="#cbd5e1" />
          <StatCard icon={<Crown size={15} />} label={tr("Wins", "Victoires")} value={stats.wins} color="#fbbf24" />
          <StatCard icon={<Medal size={15} />} label={tr("Top half", "Top moitié")} value={stats.top4} color="#34d399" />
          <StatCard icon={<Trophy size={15} />} label={tr("Avg place", "Place moy.")} value={stats.games ? stats.avg.toFixed(1) : "—"} color="#38bdf8" />
        </div>

        {/* Achievements — earned light up, locked are dimmed. */}
        <div className="panel rounded-2xl p-3">
          <h2 className="text-[10px] uppercase tracking-widest text-amber-200/60 font-bold mb-2.5 px-1 flex items-center justify-between">
            <span>{tr("Achievements", "Hauts faits")}</span>
            <span className="text-slate-500 tabular-nums">{earnedCount}/{achievements.length}</span>
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {achievements.map((a) => {
              const color = ACHIEVEMENT_TIER_COLOR[a.tier];
              return (
                <div
                  key={a.id}
                  title={`${tr(a.name, a.nameFr)} — ${tr(a.desc, a.descFr)}${a.earned ? "" : tr(" (locked)", " (verrouillé)")}`}
                  className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-all ${a.earned ? "" : "opacity-30 grayscale"}`}
                  style={a.earned ? { borderColor: `${color}80`, background: `${color}14`, boxShadow: `0 0 14px -8px ${color}` } : { borderColor: "rgba(148,163,184,0.18)", background: "rgba(255,255,255,0.02)" }}
                >
                  <span className="text-lg leading-none">{a.icon}</span>
                  <span className="text-[8px] font-bold text-center leading-tight px-0.5 truncate w-full" style={{ color: a.earned ? color : "#64748b" }}>{tr(a.name, a.nameFr)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* History list */}
        <div className="panel rounded-2xl p-3">
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
                  <button key={g.code} onClick={() => setSelected(g)} className="w-full text-left px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-amber-500/30 transition-colors">
                    <div className="flex items-center gap-3">
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
                    {/* Final team + active traits recap */}
                    {(g.team?.length || g.traits?.length) ? (
                      <div className="flex items-center gap-2 mt-2 pl-12 flex-wrap">
                        {g.traits && g.traits.length > 0 && (
                          <div className="flex items-center gap-1 pr-2 mr-1 border-r border-white/[0.06]">
                            {g.traits.slice(0, 8).map((tt) => (
                              <span key={tt.k} title={tt.k} className="inline-flex items-center justify-center w-4 h-4" style={{ color: (TYPE_COLOR as Record<string, string>)[tt.k] ?? "#94a3b8" }}>
                                <TraitGlyph traitKey={tt.k} size={12} />
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-0.5 flex-wrap">
                          {g.team?.map((u, i) => {
                            const dex = getDef(u.d).dex[Math.min(2, Math.max(0, u.s - 1))];
                            return (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={spriteUrl(dex)} alt="" width={22} height={22} title={getDef(u.d).name} style={{ imageRendering: "pixelated" }} className="opacity-90" />
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Full game recap — opened by clicking a history row. */}
      {selected && <MatchDetail game={selected} lang={lang} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** A full recap of one finished game: placement, regions, every active trait, and the
 *  complete final comp with stars — the "whole game" view behind a history row. */
function MatchDetail({ game, lang, onClose }: { game: GameResult; lang: string; onClose: () => void }) {
  const tr = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const color = placeColor(game.place, game.players);
  const regions = game.regions?.map((r) => (GEN_LABELS[r] ?? `Gen ${r}`).split("—")[1]?.trim() ?? `Gen ${r}`).join(", ");
  const traits = (game.traits ?? []).filter((t) => t.t > 0).sort((a, b) => b.t - a.t);
  const team = (game.team ?? []).slice().sort((a, b) => b.s - a.s);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-base shrink-0" style={{ background: `${color}22`, color, border: `1px solid ${color}66` }}>
            #{game.place}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-extrabold gild-text">
              {game.place === 1 ? tr("Victory", "Victoire") : tr(`Placed ${game.place} of ${game.players}`, `${game.place}ᵉ sur ${game.players}`)}
            </div>
            <div className="text-[11px] text-slate-500 truncate">{regions || "—"}{typeof game.ts === "number" ? ` · ${new Date(game.ts).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-amber-300 shrink-0"><X size={18} /></button>
        </div>

        {/* Active traits */}
        {traits.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[10px] uppercase tracking-widest text-amber-200/60 font-bold mb-2">{tr("Synergies", "Synergies")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {traits.map((t) => {
                const c = (TYPE_COLOR as Record<string, string>)[t.k] ?? "#94a3b8";
                const label = TRAITS_BY_KEY[t.k]?.label ?? t.k;
                return (
                  <span key={t.k} className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md border" style={{ background: `${c}14`, borderColor: `${c}44` }}>
                    <span style={{ color: c }}><TraitGlyph traitKey={t.k} size={13} /></span>
                    <span className="text-[11px] font-semibold text-slate-200">{label}</span>
                    <span className="text-[9px] font-bold px-1 rounded text-black/80 tabular-nums" style={{ background: c }}>{t.t}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Final comp */}
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-amber-200/60 font-bold mb-2">{tr("Final board", "Composition finale")} · {team.length}</h3>
          {team.length === 0 ? (
            <p className="text-[12px] text-slate-600 py-4 text-center">{tr("No board recorded.", "Aucune composition enregistrée.")}</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {team.map((u, i) => {
                const def = getDef(u.d);
                const stage = Math.min(2, Math.max(0, u.s - 1));
                const dex = def.dex[stage];
                const name = def.stageNames?.[stage] ?? def.name;
                return (
                  <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                    <span className="text-[9px] font-bold text-amber-300 leading-none tabular-nums">{"★".repeat(u.s)}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={spriteUrl(dex)} alt="" width={44} height={44} style={{ imageRendering: "pixelated" }} />
                    <span className="text-[10px] font-semibold text-slate-300 text-center leading-tight truncate max-w-full">{name}</span>
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
    <div className="panel rounded-xl p-2.5 flex flex-col items-center gap-0.5">
      <span style={{ color }}>{icon}</span>
      <span className="text-lg font-extrabold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-slate-500 text-center leading-tight">{label}</span>
    </div>
  );
}
