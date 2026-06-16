"use client";

import { useEffect, useState } from "react";
import { useRoom } from "@/game/net/roomStore";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { beginMatch, addInvitePlaceholder } from "@/game/net/match";
import { kickoffServerGame } from "@/game/net/serverGame";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { sendInvite } from "@/game/net/users";
import { PokeballIcon } from "@/components/game/icons";
import { Settings, Swords, UserPlus } from "lucide-react";
import { enterFullscreen } from "@/lib/fullscreen";
import { GameRulesPanel } from "./GameRulesPanel";
import { unitsForGenerations } from "@/game/data/mons";
import { useT } from "@/lib/i18n";

const GEN_NAMES = ["", "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"];

export function LobbyScreen() {
  const t = useT();
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const setReady = useRoom((s) => s.setReady);
  const setRules = useRoom((s) => s.setRules);
  const addBot = useRoom((s) => s.addBot);
  const removePlayer = useRoom((s) => s.removePlayer);
  const leave = useRoom((s) => s.leave);
  const publishLobby = useRoom((s) => s.publishLobby);
  const removeLobby = useRoom((s) => s.removeLobby);
  const clearMySave = useRoom((s) => s.clearMySave);
  const preRules = usePreLobby((s) => s.rules);
  const setPreRules = usePreLobby((s) => s.setRules);
  const friends = useAuth((s) => s.friends);
  const myProfile = useAuth((s) => s.profile);
  const lang = useAppStore((s) => s.settings.language);
  const [showRules, setShowRules] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [startError, setStartError] = useState<string | null>(null);

  const isHost = room?.meta?.hostUid === myUid;

  // Host: keep the game-browser listing's player count fresh, and delist when the
  // lobby closes (game starts → unmount, or host leaves).
  const lobbyCount = room ? Object.values(room.players ?? {}).filter((p) => p.connected).length : 0;
  const isPrivate = room?.rules?.isPrivate === true;
  useEffect(() => { if (isHost && !isPrivate) publishLobby(lobbyCount); else if (isHost && isPrivate) removeLobby(); }, [isHost, isPrivate, lobbyCount, publishLobby, removeLobby]);
  useEffect(() => () => { if (isHost) removeLobby(); }, [isHost, removeLobby]);
  // Clear my private econ on entering the lobby so a "Play again" rematch in the
  // same room starts fresh instead of restoring the finished game from priv.
  useEffect(() => { clearMySave(); }, [clearMySave]);

  useEffect(() => {
    if (!room || !isHost) return;
    setRules({ startingHp: preRules.startingHp, generations: preRules.generations, itemsEnabled: preRules.itemsEnabled, draftPoolSize: preRules.draftPoolSize, maxPlayers: preRules.maxPlayers, augmentsEnabled: preRules.augmentsEnabled, serverDriven: preRules.serverDriven, isPrivate: preRules.isPrivate });
  }, [isHost, room, setRules, preRules.startingHp, preRules.generations, preRules.itemsEnabled, preRules.draftPoolSize, preRules.maxPlayers, preRules.augmentsEnabled, preRules.serverDriven, preRules.isPrivate]);

  const roomGenKey = (room?.rules?.generations ?? [1]).join(",");
  const roomItemKey = (room?.rules?.itemsEnabled ?? []).join(",");
  const roomHp = room?.rules?.startingHp;
  useEffect(() => {
    if (!room || isHost) return;
    setPreRules({
      startingHp: room.rules?.startingHp ?? 100,
      generations: room.rules?.generations ?? [1],
      itemsEnabled: room.rules?.itemsEnabled ?? [],
      draftPoolSize: room.rules?.draftPoolSize ?? 60,
      maxPlayers: room.rules?.maxPlayers ?? 8,
      augmentsEnabled: room.rules?.augmentsEnabled !== false,
      isPrivate: room.rules?.isPrivate === true,
    });
  }, [isHost, room, setPreRules, roomHp, roomGenKey, roomItemKey, room?.rules?.draftPoolSize, room?.rules?.maxPlayers, room?.rules?.augmentsEnabled, room?.rules?.isPrivate]);

  if (!room) return null;

  const players = Object.values(room.players ?? {})
    .filter((p) => p.connected)
    .sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
  const me = myUid ? room.players?.[myUid] : undefined;
  const maxPlayers = room.rules?.maxPlayers ?? 8;
  // Invited-but-not-yet-joined friends → shown as pending placeholder slots.
  const pendingInvites = Object.entries(room.invited ?? {})
    .filter(([uid]) => !room.players?.[uid])
    .map(([uid, v]) => ({ uid, ...v }));
  const openSlots = Math.max(0, maxPlayers - players.length - pendingInvites.length);
  const allReady = players.every((p) => p.ready);
  // Need at least 2 players (humans and/or bots) — a 1-player game has no
  // opponent, so it can never deal damage or end. Add a bot to play solo.
  const canStart = isHost && players.length >= 2 && allReady;

  const gens = room.rules?.generations ?? [1];
  const poolCount = unitsForGenerations(gens).length;
  const items = room.rules?.itemsEnabled ?? [];

  const Portrait = ({ name, photo, ready, isBot }: { name?: string; photo?: string | null; ready?: boolean; isBot?: boolean }) => (
    <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center text-xl font-extrabold overflow-hidden shrink-0 transition-all ${isBot ? "bg-violet-950/50 border-violet-600 text-violet-300" : ready ? "bg-slate-800 border-emerald-500/70 shadow-[0_0_18px_-4px_rgba(16,185,129,0.7)] text-emerald-200" : "bg-slate-800 border-slate-600 text-slate-300"}`}>
      {isBot ? "AI" : photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt="" width={56} height={56} style={{ imageRendering: "pixelated" }} />
        : (name || "?").slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col app-bg">
      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-white/[0.06] bg-slate-950/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-amber-400 shrink-0"><PokeballIcon size={26} /></span>
          <div className="min-w-0">
            <h1 className="font-extrabold tracking-tight text-base sm:text-lg text-slate-100 truncate">Poké<span className="text-amber-400">TFT</span><span className="text-slate-500 font-normal text-sm ml-2 hidden sm:inline">— {t.l_lobby}</span></h1>
            <p className="text-[11px] text-slate-500 -mt-0.5 truncate">{t.l_net_players(players.length, maxPlayers)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button onClick={leave} className="px-2.5 sm:px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.l_net_leave}</button>
        </div>
      </header>

      {/* Party stage */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center gap-7 p-4 sm:p-8 overflow-y-auto">
        <div className="panel w-full max-w-[680px] rounded-2xl p-5 sm:p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-extrabold gild-text leading-none">{lang === "fr" ? "Salon" : "Lobby"}</h2>
              <p className="text-[11px] text-slate-500 mt-1">{lang === "fr" ? "Invitez vos amis ou ajoutez des IA" : "Invite friends or add AIs"}</p>
            </div>
            <span className="text-[12px] font-extrabold px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-slate-200 tabular-nums">{players.length + pendingInvites.length}/{maxPlayers}</span>
          </div>
          {/* Party portrait row (wraps responsively) */}
          <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-4">
            {players.map((p) => (
              <div key={p.uid} className="relative flex flex-col items-center gap-1.5 w-20">
                {isHost && p.isBot && <button onClick={() => removePlayer(p.uid)} className="absolute -top-1.5 -right-0.5 z-10 w-5 h-5 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:text-rose-400 text-xs leading-none">×</button>}
                <Portrait name={p.name} photo={p.photoURL} ready={p.ready} isBot={p.isBot} />
                <span className="text-xs font-bold text-slate-200 truncate max-w-full text-center">{p.name}</span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {p.isHost && <span className="text-[8px] font-bold uppercase bg-amber-500 text-black rounded px-1 leading-tight">{t.l_net_host}</span>}
                  {p.uid === myUid && <span className="text-[8px] font-bold uppercase bg-sky-600 text-white rounded px-1 leading-tight">{t.l_net_you}</span>}
                </div>
                <span className={`text-[10px] font-semibold ${p.ready ? "text-emerald-400" : "text-slate-500"}`}>{p.isBot ? p.botDifficulty : p.ready ? t.l_net_ready_up : t.l_net_not_ready}</span>
              </div>
            ))}
            {/* Pending invites — placeholder slots until the friend accepts. */}
            {pendingInvites.map((p) => (
              <div key={`inv-${p.uid}`} className="flex flex-col items-center gap-1.5 w-20">
                <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/[0.04] flex items-center justify-center overflow-hidden shrink-0 animate-pulse">
                  {p.photoURL
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.photoURL} alt="" width={44} height={44} style={{ imageRendering: "pixelated", opacity: 0.5 }} />
                    : <span className="text-lg font-extrabold text-amber-300/50">{(p.username || "?").slice(0, 1).toUpperCase()}</span>}
                </div>
                <span className="text-xs font-bold text-slate-400 truncate max-w-full text-center">{p.username}</span>
                <span className="text-[10px] font-semibold text-amber-400/80">{lang === "fr" ? "Invité…" : "Invited…"}</span>
              </div>
            ))}
            {Array.from({ length: openSlots }).map((_, i) => (
              <div key={`o-${i}`} className="flex flex-col items-center gap-1.5 w-20">
                <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-700/70 flex items-center justify-center text-slate-700 text-2xl">+</div>
                <span className="text-[10px] text-slate-600">{t.l_net_open_slot}</span>
              </div>
            ))}
          </div>

          {/* Host: add AI */}
          {isHost && openSlots > 0 && (
            <div className="flex items-center justify-center gap-2 mt-5 pt-4 border-t border-slate-800">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{t.l_net_add_ai}</span>
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button key={d} data-testid={`add-bot-${d}`} onClick={() => addBot(d)} className="px-3 py-1.5 rounded-md bg-violet-900/50 hover:bg-violet-700 border border-violet-700 text-[11px] font-bold text-violet-200 capitalize transition-colors">
                  {d === "easy" ? t.p_diff_easy : d === "medium" ? t.p_diff_medium : t.p_diff_hard}
                </button>
              ))}
            </div>
          )}

          {/* Invite friends */}
          <div className="mt-3 pt-4 border-t border-white/[0.06] flex flex-col items-center gap-2">
            <button onClick={() => setShowInvite((s) => !s)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[11px] font-bold text-amber-300">
              <UserPlus size={13} /> {lang === "fr" ? "Inviter des amis" : "Invite friends"}
            </button>
            {showInvite && (
              <div className="w-full max-w-[380px] flex flex-col gap-1 mt-1">
                {friends.filter((f) => !room.players?.[f.uid]).length === 0 ? (
                  <p className="text-[11px] text-slate-600 text-center py-1.5">{lang === "fr" ? "Aucun ami à inviter." : "No friends to invite."}</p>
                ) : friends.filter((f) => !room.players?.[f.uid]).map((f) => (
                  <div key={f.uid} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                    <span className="flex-1 text-[12px] font-semibold text-slate-200 truncate">{f.username}</span>
                    <button
                      onClick={() => { if (myUid) { sendInvite(f.uid, room.code, myProfile?.username ?? "Player", myUid); addInvitePlaceholder(room.code, f.uid, f.username, f.photoURL); setInvited((p) => ({ ...p, [f.uid]: true })); } }}
                      disabled={invited[f.uid] || !!room.invited?.[f.uid]}
                      className="px-2.5 py-1 rounded-md bg-amber-500/90 hover:bg-amber-400 text-black text-[10px] font-bold disabled:opacity-50"
                    >{(invited[f.uid] || room.invited?.[f.uid]) ? (lang === "fr" ? "Invité ✓" : "Invited ✓") : (lang === "fr" ? "Inviter" : "Invite")}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Settings summary */}
        <div className="w-full max-w-[680px] flex flex-wrap items-center justify-center gap-2">
          {[
            `${gens.map((g) => GEN_NAMES[g] ?? `Gen ${g}`).join(", ")}`,
            `${poolCount} Pokémon`,
            `${room.rules?.startingHp ?? 100} ${t.net_hp}`,
            `${items.length} ${t.l_items_short}`,
          ].map((chip, i) => (
            <span key={i} className="px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-700/60 text-[11px] font-semibold text-slate-300">{chip}</span>
          ))}
          {isHost && (
            <button onClick={() => setShowRules(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold text-sky-300"><Settings size={13} /> {t.l_rules}</button>
          )}
        </div>

        {/* Start / ready */}
        {!isHost ? (
          <button onClick={() => setReady(!me?.ready)}
            className={`w-full max-w-md py-4 rounded-2xl font-extrabold text-base tracking-wide transition-all ${me?.ready ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 text-white shadow-lg shadow-emerald-500/20"}`}>
            {me?.ready ? t.l_net_not_ready : t.l_net_ready_up}
          </button>
        ) : (
          <div className="w-full max-w-md flex flex-col items-center gap-2">
            <button data-testid="start-game" disabled={!canStart} onClick={() => {
              setStartError(null);
              enterFullscreen();
              beginMatch(room.code, room)
                .then(() => kickoffServerGame(room.code)) // every game is server-driven (#110)
                .catch((e) => { console.error("[beginMatch]", e); setStartError(lang === "fr" ? "Échec du lancement. Réessaie." : "Couldn't start the match. Try again."); });
            }}
              className="w-full py-4 rounded-2xl font-extrabold text-base tracking-wide transition-all bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-30 disabled:shadow-none disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500">
              <span className="inline-flex items-center justify-center gap-2"><Swords size={18} /> {t.l_net_start}</span>
            </button>
            {!canStart && <p className="text-xs text-slate-600">{t.l_net_wait_ready}</p>}
            {startError && <p className="text-xs text-rose-400 font-semibold">{startError}</p>}
          </div>
        )}
      </main>

      {/* Rules modal (host) */}
      {showRules && isHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowRules(false)}>
          <div className="panel w-full max-w-[760px] max-h-[86vh] overflow-y-auto rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">{t.l_rules}</h2>
              <button onClick={() => setShowRules(false)} className="text-slate-500 hover:text-amber-300 text-xl leading-none">×</button>
            </div>
            <GameRulesPanel isHost={isHost} />
          </div>
        </div>
      )}
    </div>
  );
}
