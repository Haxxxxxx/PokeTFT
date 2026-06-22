"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRoom } from "@/game/net/roomStore";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { getMode, isDoubleUp } from "@/game/data/gameModes";
import { beginMatch, addInvitePlaceholder } from "@/game/net/match";
import { kickoffServerGame } from "@/game/net/serverGame";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { sendInvite, nightmareParams } from "@/game/net/users";
import type { BotDifficulty, RoomPlayer } from "@/game/net/roomStore";
import { PokeballIcon } from "@/components/game/icons";
import { Settings, Swords, UserPlus, X, Bot, Dna } from "lucide-react";
import { enterFullscreen } from "@/lib/fullscreen";
import { GameRulesPanel } from "./GameRulesPanel";
import { ModeSelect } from "./ModeSelect";
import { unitsForGenerations } from "@/game/data/mons";
import { useT } from "@/lib/i18n";

const GEN_NAMES = ["", "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"];

/** Coin-flip for the silent nightmare swap. Module-scope so the randomness lives outside React's
 *  render (it only ever runs from the add-bot click handler). */
function rollChance(p: number): boolean {
  return Math.random() < p;
}

export function LobbyScreen() {
  const t = useT();
  const room = useRoom((s) => s.room);
  const myUid = useRoom((s) => s.myUid);
  const setReady = useRoom((s) => s.setReady);
  const setRules = useRoom((s) => s.setRules);
  const addBot = useRoom((s) => s.addBot);
  const removePlayer = useRoom((s) => s.removePlayer);
  const setPlayerTeam = useRoom((s) => s.setPlayerTeam);
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
  // 2-step lobby: the host first picks a game mode (Step 1), then lands in the party lobby
  // (Step 2). Joiners skip Step 1 entirely — the host already set the mode.
  const [step, setStep] = useState<"mode" | "lobby">("mode");
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [startError, setStartError] = useState<string | null>(null);
  // Auto-clear the start error so a transient failure message doesn't linger after the
  // host fixes the lobby and the next attempt is fine.
  useEffect(() => {
    if (!startError) return;
    const id = setTimeout(() => setStartError(null), 5000);
    return () => clearTimeout(id);
  }, [startError]);

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
    setRules({ startingHp: preRules.startingHp, generations: preRules.generations, itemsEnabled: preRules.itemsEnabled, draftPoolSize: preRules.draftPoolSize, maxPlayers: preRules.maxPlayers, augmentsEnabled: preRules.augmentsEnabled, serverDriven: preRules.serverDriven, isPrivate: preRules.isPrivate, mode: preRules.mode });
  }, [isHost, room, setRules, preRules.startingHp, preRules.generations, preRules.itemsEnabled, preRules.draftPoolSize, preRules.maxPlayers, preRules.augmentsEnabled, preRules.serverDriven, preRules.isPrivate, preRules.mode]);

  // Double Up: the host keeps every connected player on a team (0..3, two per team), filling
  // the lowest open team for anyone unassigned. Idempotent — only writes when a slot is missing.
  useEffect(() => {
    if (!room || !isHost || !isDoubleUp(room.rules)) return;
    const conn = Object.values(room.players ?? {}).filter((p) => p.connected);
    const counts = [0, 0, 0, 0];
    for (const p of conn) if (typeof p.teamId === "number" && p.teamId >= 0 && p.teamId <= 3) counts[p.teamId]++;
    for (const p of conn) {
      if (typeof p.teamId === "number" && p.teamId >= 0 && p.teamId <= 3) continue;
      const t = counts.findIndex((c) => c < 2);
      if (t >= 0) { counts[t]++; setPlayerTeam(p.uid, t); }
    }
  }, [room, isHost, setPlayerTeam]);

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
      mode: room.rules?.mode ?? "standard",
    });
  }, [isHost, room, setPreRules, roomHp, roomGenKey, roomItemKey, room?.rules?.draftPoolSize, room?.rules?.maxPlayers, room?.rules?.augmentsEnabled, room?.rules?.isPrivate, room?.rules?.mode]);

  if (!room) return null;

  // Step 1 — mode selection (host only). Joiners go straight to the party lobby.
  if (isHost && step === "mode") return <ModeSelect isHost={isHost} onContinue={() => setStep("lobby")} />;

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

  // Double Up: 4 teams of 2 — group connected players by teamId so the lobby shows who's paired.
  const doubleUp = isDoubleUp(room.rules);
  const TEAM_COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6"];
  const teams: RoomPlayer[][] = [[], [], [], []];
  if (doubleUp) for (const p of players) { const tid = typeof p.teamId === "number" ? p.teamId : -1; if (tid >= 0 && tid <= 3) teams[tid].push(p); }
  // Move a player to the next team that has an open seat (host control).
  const moveToNextTeam = (uid: string, cur: number) => {
    for (let k = 1; k <= 3; k++) { const tnext = (cur + k) % 4; if (teams[tnext].length < 2) { setPlayerTeam(uid, tnext); return; } }
  };

  // The escalating AI difficulty ladder — one cohesive segmented control, accent warming with
  // threat. (Nightmare is NOT here: it's the hidden boss tier that silently replaces ultimate.)
  const DIFFS: { id: BotDifficulty; label: string; accent: string }[] = [
    { id: "easy",     label: t.p_diff_easy,     accent: "text-emerald-300" },
    { id: "medium",   label: t.p_diff_medium,   accent: "text-sky-300" },
    { id: "hard",     label: t.p_diff_hard,     accent: "text-violet-300" },
    { id: "expert",   label: t.p_diff_expert,   accent: "text-amber-300" },
    { id: "ultimate", label: t.p_diff_ultimate, accent: "text-rose-300" },
  ];
  const diffLabel = (d?: BotDifficulty): string =>
    d === "nightmare" ? "?????" :
    d === "clone" ? "Clone" :
    d === "easy" ? t.p_diff_easy : d === "medium" ? t.p_diff_medium : d === "hard" ? t.p_diff_hard :
    d === "expert" ? t.p_diff_expert : d === "ultimate" ? t.p_diff_ultimate : (d ?? "");

  // Hidden progression: once the host has banked enough ultimate-bot wins, each "ultimate" they
  // add has a ramping chance to spawn as a nightmare instead — no UI tell, just a creeping dread.
  const nm = nightmareParams(myProfile?.ultimateBotWins ?? 0);
  const addOpponent = (d: BotDifficulty) => {
    if (d === "ultimate" && nm.unlocked && rollChance(nm.replaceChance)) addBot("nightmare", { statBuff: nm.statBuff });
    else addBot(d);
  };

  const Portrait = ({ name, photo, ready, isBot, nightmare }: { name?: string; photo?: string | null; ready?: boolean; isBot?: boolean; nightmare?: boolean }) => (
    <div className={`w-16 h-16 rounded-xl border flex items-center justify-center text-xl font-bold overflow-hidden shrink-0 transition-all ${
      nightmare ? "bg-rose-950/60 border-rose-600/70 text-rose-300 animate-pulse"
      : isBot ? "bg-violet-950/40 border-violet-600/50 text-violet-300"
      : ready ? "bg-slate-800/80 border-emerald-500/60 text-emerald-200"
      : "bg-slate-800/60 border-white/10 text-slate-300"}`}>
      {nightmare ? "💀" : isBot ? <Bot size={26} /> : photo
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
          {(() => {
            const gm = getMode(room.rules?.mode);
            // Mode badge — clickable for the host to jump back to Step 1 and change it.
            const badge = (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-extrabold"
                style={{ borderColor: `${gm.color}66`, color: gm.color, background: `${gm.color}14` }}>
                {lang === "fr" ? gm.nameFr : gm.name}{isHost && <Settings size={11} className="opacity-70" />}
              </span>
            );
            return isHost
              ? <button onClick={() => setStep("mode")} title={lang === "fr" ? "Changer de mode" : "Change mode"} className="transition-transform hover:scale-[1.03]">{badge}</button>
              : gm.id === "standard" ? null : <span className="hidden sm:inline-flex">{badge}</span>;
          })()}
          <button onClick={leave} className="px-2.5 sm:px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-xs font-bold text-slate-300">{t.l_net_leave}</button>
        </div>
      </header>

      {/* Party stage */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center gap-7 p-4 sm:p-8 overflow-y-auto">
        <div className="panel w-full max-w-[680px] rounded-xl p-5 sm:p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-extrabold gild-text leading-none">{lang === "fr" ? "Salon" : "Lobby"}</h2>
              <p className="text-[11px] text-slate-500 mt-1">{lang === "fr" ? "Invitez vos amis ou ajoutez des IA" : "Invite friends or add AIs"}</p>
            </div>
            <span className="text-[12px] font-extrabold px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-slate-200 tabular-nums">{players.length + pendingInvites.length}/{maxPlayers}</span>
          </div>
          {/* PlayerTile — one party member (portrait + name + badges + status). */}
          {(() => {
            const PlayerTile = ({ p, extra }: { p: RoomPlayer; extra?: ReactNode }) => (
              <div className="relative flex flex-col items-center gap-1.5 w-20">
                {isHost && p.isBot && <button onClick={() => removePlayer(p.uid)} className="absolute -top-1.5 -right-0.5 z-10 w-5 h-5 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:text-rose-400 text-xs leading-none">×</button>}
                {extra}
                <Portrait name={p.name} photo={p.photoURL} ready={p.ready} isBot={p.isBot} nightmare={p.botDifficulty === "nightmare"} />
                <span className="text-xs font-bold text-slate-200 truncate max-w-full text-center">{p.name}</span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {p.isHost && <span className="text-[8px] font-bold uppercase bg-amber-500 text-black rounded px-1 leading-tight">{t.l_net_host}</span>}
                  {p.uid === myUid && <span className="text-[8px] font-bold uppercase bg-sky-600 text-white rounded px-1 leading-tight">{t.l_net_you}</span>}
                </div>
                <span className={`text-[10px] font-semibold capitalize ${p.botDifficulty === "nightmare" ? "text-rose-400 tracking-[0.15em]" : p.isBot ? "text-violet-300/80" : p.ready ? "text-emerald-400" : "text-slate-500"}`}>{p.isBot ? diffLabel(p.botDifficulty) : p.ready ? t.l_net_ready_up : t.l_net_not_ready}</span>
              </div>
            );
            const EmptySeat = () => (
              <div className="flex flex-col items-center gap-1.5 w-20">
                <div className="w-16 h-16 rounded-xl border border-dashed border-white/10 flex items-center justify-center text-slate-700 text-2xl">+</div>
                <span className="text-[10px] text-slate-600">{t.l_net_open_slot}</span>
              </div>
            );
            const PendingTile = ({ p }: { p: { uid: string; username?: string; photoURL?: string | null } }) => (
              <div className="flex flex-col items-center gap-1.5 w-20">
                <div className="w-16 h-16 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.04] flex items-center justify-center overflow-hidden shrink-0 animate-pulse">
                  {p.photoURL
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.photoURL} alt="" width={44} height={44} style={{ imageRendering: "pixelated", opacity: 0.5 }} />
                    : <span className="text-lg font-bold text-amber-300/50">{(p.username || "?").slice(0, 1).toUpperCase()}</span>}
                </div>
                <span className="text-xs font-bold text-slate-400 truncate max-w-full text-center">{p.username}</span>
                <span className="text-[10px] font-semibold text-amber-400/80">{lang === "fr" ? "Invité…" : "Invited…"}</span>
              </div>
            );

            // Double Up: 4 team cards of 2 so you see exactly who plays with who.
            if (doubleUp) {
              const canMove = teams.filter((tm) => tm.length < 2).length > 0;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {teams.map((members, ti) => {
                    const color = TEAM_COLORS[ti];
                    return (
                      <div key={ti} className="rounded-xl border p-3" style={{ borderColor: `${color}40`, background: `${color}0c` }}>
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color }}>{lang === "fr" ? "Équipe" : "Team"} {ti + 1}</span>
                          <span className="text-[10px] tabular-nums font-bold" style={{ color: `${color}bb` }}>{members.length}/2</span>
                        </div>
                        <div className="flex items-start justify-center gap-3">
                          {[0, 1].map((slot) => {
                            const p = members[slot];
                            if (!p) return <EmptySeat key={slot} />;
                            return <PlayerTile key={p.uid} p={p} extra={isHost && canMove
                              ? <button onClick={() => moveToNextTeam(p.uid, ti)} title={lang === "fr" ? "Changer d'équipe" : "Move team"} className="absolute -top-1.5 -left-0.5 z-10 w-5 h-5 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:text-sky-300 text-[11px] leading-none">⇄</button>
                              : undefined} />;
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {pendingInvites.length > 0 && (
                    <div className="sm:col-span-2 flex flex-wrap items-start justify-center gap-3 pt-1">
                      {pendingInvites.map((p) => <PendingTile key={`inv-${p.uid}`} p={p} />)}
                    </div>
                  )}
                </div>
              );
            }

            // Standard / FFA: a single wrapping party row.
            return (
              <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-4">
                {players.map((p) => <PlayerTile key={p.uid} p={p} />)}
                {pendingInvites.map((p) => <PendingTile key={`inv-${p.uid}`} p={p} />)}
                {Array.from({ length: openSlots }).map((_, i) => <EmptySeat key={`o-${i}`} />)}
              </div>
            );
          })()}

          {/* Host: add AI — an escalating difficulty ladder + the Clone special. */}
          {isHost && openSlots > 0 && (
            <div className="flex flex-col items-center gap-3 mt-6 pt-5 border-t border-white/[0.06]">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold"><Bot size={12} /> {t.l_net_add_ai}</span>
              {/* Segmented difficulty ladder — equal-width tiers, accent warming with threat. */}
              <div className="flex items-stretch gap-1 p-1 rounded-xl bg-slate-950/50 border border-white/[0.06]">
                {DIFFS.map((d, i) => (
                  <button
                    key={d.id}
                    data-testid={`add-bot-${d.id}`}
                    onClick={() => addOpponent(d.id)}
                    title={`${d.label}${d.id === "ultimate" ? " — counter-drafts your board" : ""}`}
                    className={`group relative px-3 sm:px-3.5 py-2 rounded-lg text-[11px] font-extrabold transition-all hover:bg-white/[0.06] ${d.accent}`}
                  >
                    {/* threat dots: easy=1 … ultimate=5 */}
                    <span className="flex gap-0.5 justify-center mb-1 opacity-70 group-hover:opacity-100">
                      {Array.from({ length: i + 1 }).map((_, k) => <span key={k} className="w-1 h-1 rounded-full bg-current" />)}
                    </span>
                    {d.label}
                  </button>
                ))}
              </div>
              {/* Clone bot — replays YOUR last game, round by round. */}
              <button data-testid="add-bot-clone" onClick={() => addBot("clone")}
                title={lang === "fr" ? "Un clone qui rejoue TA dernière partie, tour par tour" : "A clone that replays YOUR last game, round by round"}
                className="px-3.5 py-2 rounded-lg border text-[11px] font-bold transition-colors bg-sky-950/40 hover:bg-sky-800/60 border-sky-600/40 text-sky-200 inline-flex items-center gap-1.5">
                <Dna size={13} /> {lang === "fr" ? "Clone (ta dernière partie)" : "Clone (your last game)"}
              </button>
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
            className={`w-full max-w-md py-3.5 rounded-xl font-bold text-[15px] tracking-wide transition-colors border ${me?.ready ? "bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]" : "bg-emerald-500 border-emerald-400/50 text-white hover:bg-emerald-400"}`}>
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
              className="btn-primary w-full py-3.5 rounded-xl font-bold text-[15px] tracking-wide disabled:cursor-not-allowed">
              <span className="inline-flex items-center justify-center gap-2"><Swords size={18} /> {t.l_net_start}</span>
            </button>
            {!canStart && <p className="text-xs text-slate-600">{t.l_net_wait_ready}</p>}
            {startError && <p className="text-xs text-rose-400 font-semibold">{startError}</p>}
          </div>
        )}
      </main>

      {/* Rules drawer (host) — slides in from the right; the lobby stays visible behind. Kept
          mounted so the slide animates; pointer-events gated so it never blocks when closed. */}
      {isHost && (
        <div className={`fixed inset-0 z-50 ${showRules ? "" : "pointer-events-none"}`} aria-hidden={!showRules}>
          <div onClick={() => setShowRules(false)} className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${showRules ? "opacity-100" : "opacity-0"}`} />
          <aside className={`absolute inset-y-0 right-0 w-full max-w-[480px] panel border-l border-white/[0.08] shadow-2xl shadow-black/50 overflow-y-auto transition-transform duration-300 ease-out ${showRules ? "translate-x-0" : "translate-x-full"}`}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[var(--panel-bg,rgba(10,12,20,0.92))] backdrop-blur border-b border-white/[0.06]">
              <h2 className="inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.2em] gild-text"><Settings size={14} /> {t.l_rules}</h2>
              <button onClick={() => setShowRules(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-white/[0.06] transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5">
              <GameRulesPanel isHost={isHost} showMode={false} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
