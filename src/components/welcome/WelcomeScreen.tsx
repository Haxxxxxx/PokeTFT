"use client";

import { useEffect, useState } from "react";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { useRoom } from "@/game/net/roomStore";
import { useAuth } from "@/game/net/authStore";
import { AppSettingsPanel } from "./AppSettingsPanel";
import { FriendsPanel } from "@/components/social/FriendsPanel";
import { ProfileEditor } from "@/components/social/ProfileEditor";
import { HowToPlay } from "@/components/HowToPlay";
import { spriteUrl } from "@/game/data/mons";
import { useT } from "@/lib/i18n";

type Mode = "idle" | "join";

// Decorative hero composition — random showcase mons scattered behind the play CTA.
const HERO_SLOTS: { x: string; y: string; size: number; rot: number }[] = [
  { x: "6%", y: "12%", size: 170, rot: -12 },
  { x: "76%", y: "8%", size: 150, rot: 10 },
  { x: "2%", y: "60%", size: 160, rot: 8 },
  { x: "80%", y: "58%", size: 150, rot: -8 },
  { x: "40%", y: "2%", size: 120, rot: 0 },
];
// A pool of visually striking Pokémon across generations to draw from.
const SHOWCASE_DEX = [
  6, 9, 3, 149, 94, 130, 143, 448, 282, 384, 445, 248, 658, 700, 887, 38, 59, 131,
  134, 135, 136, 197, 196, 169, 212, 230, 257, 260, 359, 376, 392, 395, 405, 462,
  468, 472, 530, 553, 609, 612, 635, 663, 681, 724, 745, 778, 793, 809, 887, 998,
];

export function WelcomeScreen() {
  const t = useT();
  const rules = usePreLobby((s) => s.rules);
  const host = useRoom((s) => s.host);
  const join = useRoom((s) => s.join);
  const status = useRoom((s) => s.status);
  const netError = useRoom((s) => s.error);
  const profile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);
  const isGuest = useAuth((s) => s.user?.isAnonymous ?? false);
  const [username, setUsername] = useState(profile?.username ?? "");
  const [mode, setMode] = useState<Mode>("idle");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [howTo, setHowTo] = useState(false);
  // Random showcase mons each visit (client-only to avoid hydration mismatch).
  const [heroMons, setHeroMons] = useState(() => HERO_SLOTS.map((s, i) => ({ ...s, dex: SHOWCASE_DEX[i] })));
  useEffect(() => {
    const pool = [...SHOWCASE_DEX];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeroMons(HERO_SLOTS.map((s, i) => ({ ...s, dex: pool[i] })));
  }, []);

  // Show the tutorial automatically the first time someone lands here.
  useEffect(() => {
    try {
      if (!localStorage.getItem("poketft_seen_howto")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHowTo(true);
        localStorage.setItem("poketft_seen_howto", "1");
      }
    } catch { /* ignore */ }
  }, []);

  const name = (isGuest ? username : profile?.username ?? "").trim();
  const canProceed = name.length > 0;
  const busy = status === "connecting";

  async function handleCreate() {
    if (!canProceed || busy) return;
    await host(name, { startingHp: rules.startingHp, maxPlayers: rules.maxPlayers, generations: rules.generations, itemsEnabled: rules.itemsEnabled });
  }
  async function handleJoin() {
    if (!canProceed || joinCode.trim().length < 6) { setJoinError(true); return; }
    setJoinError(false);
    await join(joinCode.trim(), name);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "radial-gradient(120% 80% at 50% -10%, #1a2540 0%, #0a1020 60%)" }}>
      {/* Top nav bar */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 h-16 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-rose-500 text-2xl">⬡</span>
          <span className="font-extrabold tracking-tight text-xl text-slate-100">Poké<span className="text-amber-400">TFT</span></span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setHowTo(true)} className="text-xs font-bold text-slate-400 hover:text-sky-300 uppercase tracking-wide">{t.w_how_to_play}</button>
          {/* Profile chip */}
          <div className="flex items-center gap-2.5 pl-3 border-l border-slate-800">
            <span className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              {profile?.photoURL
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.photoURL} alt="" width={30} height={30} style={{ imageRendering: "pixelated" }} />
                : <span className="text-sm font-extrabold text-slate-500">{(name || "?").slice(0, 1).toUpperCase()}</span>}
            </span>
            <div className="flex flex-col leading-tight">
              {isGuest ? (
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.w_username_placeholder} maxLength={24}
                  className="bg-transparent text-sm font-bold text-amber-300 w-28 focus:outline-none placeholder:text-slate-600" />
              ) : (
                <span className="text-sm font-bold text-amber-300">{profile?.username}</span>
              )}
              <span className="flex gap-2 text-[10px]">
                {!isGuest && <button onClick={() => setEditProfile(true)} className="text-sky-400 hover:text-sky-300">Edit</button>}
                <button onClick={signOut} className="text-slate-500 hover:text-rose-400">{isGuest ? "Sign in" : "Sign out"}</button>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 w-full max-w-[1320px] mx-auto flex flex-col lg:flex-row gap-6 p-4 sm:p-6 items-stretch">
        {/* Hero / play */}
        <main className="flex-1 flex flex-col min-h-[420px]">
          <div className="flex-1 flex flex-col justify-center items-center gap-8 rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur p-10 relative overflow-hidden"
            style={{ background: "radial-gradient(70% 80% at 50% 30%, rgba(251,191,36,0.08), transparent 60%), rgba(15,23,42,0.5)" }}>
            {/* Decorative floating mons */}
            <div className="absolute inset-0 pointer-events-none select-none">
              {heroMons.map((m, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={spriteUrl(m.dex)} alt="" width={m.size} height={m.size}
                  className="absolute hero-float" style={{ left: m.x, top: m.y, width: m.size, ["--r" as string]: `${m.rot}deg`, imageRendering: "pixelated", opacity: 0.13, filter: "saturate(1.1)", animationDelay: `${i * 0.6}s` }} />
              ))}
            </div>

            <div className="text-center relative z-10">
              <h1 className="font-extrabold tracking-tight text-3xl sm:text-5xl text-slate-100 drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]">{t.w_hero_title}</h1>
              <p className="text-slate-400 text-sm mt-2">{t.w_subtitle}</p>
            </div>

            {mode === "idle" ? (
              <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                <button onClick={handleCreate} disabled={!canProceed || busy}
                  className="w-full py-4 rounded-2xl font-extrabold text-base tracking-wide bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/20 disabled:opacity-30 disabled:shadow-none transition-all">
                  {busy ? "…" : t.w_create_btn}
                </button>
                <button onClick={() => setMode("join")} disabled={!canProceed}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-slate-800/80 hover:bg-slate-700 text-sky-300 border border-slate-700 disabled:opacity-30 transition-all">
                  {t.w_join}
                </button>
                {!canProceed && <p className="text-[11px] text-slate-600">{t.w_username_placeholder}</p>}
                {netError && <p className="text-xs text-rose-400">{netError}</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3 w-full max-w-sm">
                <label className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{t.w_join_code_label}</label>
                <input value={joinCode} onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }} placeholder={t.w_join_code_placeholder} maxLength={6} autoFocus
                  className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-center text-lg font-mono font-bold text-amber-400 tracking-[0.3em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none ${joinError ? "border-rose-600" : "border-slate-700 focus:border-sky-500"}`} />
                {joinError && <p className="text-xs text-rose-400">{t.w_join_error}</p>}
                <div className="flex gap-3">
                  <button onClick={handleJoin} disabled={!canProceed || busy}
                    className="flex-1 py-3 rounded-xl font-extrabold text-sm bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-30 transition-all">{busy ? "…" : t.w_join_btn}</button>
                  <button onClick={() => { setMode("idle"); setJoinCode(""); setJoinError(false); }}
                    className="px-5 py-3 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700">{t.w_back}</button>
                </div>
                {netError && <p className="text-xs text-rose-400">{netError}</p>}
              </div>
            )}
          </div>
        </main>

        {/* Right rail: friends + settings */}
        <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
          <FriendsPanel />
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-5">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-800 pb-2">{t.s_title}</h2>
            <AppSettingsPanel />
          </div>
        </aside>
      </div>

      {editProfile && <ProfileEditor onClose={() => setEditProfile(false)} />}
      {howTo && <HowToPlay onClose={() => setHowTo(false)} />}
    </div>
  );
}
