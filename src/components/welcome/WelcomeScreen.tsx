"use client";

import { useEffect, useState } from "react";
import { usePreLobby } from "@/game/store/preLobbyStore";
import { useRoom } from "@/game/net/roomStore";
import { useAuth } from "@/game/net/authStore";
import { useAppStore } from "@/game/store/appStore";
import { subscribeInvites, clearInvite, type Invite } from "@/game/net/users";
import { clearInvitePlaceholder } from "@/game/net/match";
import { AppSettingsPanel } from "./AppSettingsPanel";
import { FriendsPanel } from "@/components/social/FriendsPanel";
import { ProfileTile } from "./ProfileTile";
import { ProfileEditor } from "@/components/social/ProfileEditor";
import { HowToPlay } from "@/components/HowToPlay";
import { NewsModal, hasUnseenNews, markNewsSeen } from "@/components/NewsModal";
import { PokeballIcon } from "@/components/game/icons";
import { isNativeShell } from "@/game/net/nativeShell";
import { Swords, Trophy, Megaphone, AlertTriangle, Download } from "lucide-react";
import { spriteUrl } from "@/game/data/mons";
import { useT } from "@/lib/i18n";

const GEN_NAMES = ["", "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"];

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
  const lobbies = useRoom((s) => s.lobbies);
  const watchLobbies = useRoom((s) => s.watchLobbies);
  const unwatchLobbies = useRoom((s) => s.unwatchLobbies);
  const status = useRoom((s) => s.status);
  const netError = useRoom((s) => s.error);
  const profile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);
  const setProfileOpen = useAppStore((s) => s.setProfileOpen);
  const setLeaderboardOpen = useAppStore((s) => s.setLeaderboardOpen);
  const lang = useAppStore((s) => s.settings.language);
  const myUid = useAuth((s) => s.user?.uid);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [editProfile, setEditProfile] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [news, setNews] = useState(false);
  const [unseenNews, setUnseenNews] = useState(false);
  // Show the "Get the app" link only to web visitors (hidden inside the shell).
  const [showGetApp, setShowGetApp] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setUnseenNews(hasUnseenNews()); setShowGetApp(!isNativeShell()); }, []);
  const openNews = () => { setNews(true); markNewsSeen(); setUnseenNews(false); };
  // Random showcase mons each visit (client-only to avoid hydration mismatch).
  const [heroMons, setHeroMons] = useState(() => HERO_SLOTS.map((s, i) => ({ ...s, dex: SHOWCASE_DEX[i] })));
  useEffect(() => {
    const pool = [...SHOWCASE_DEX];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeroMons(HERO_SLOTS.map((s, i) => ({ ...s, dex: pool[i] })));
  }, []);

  // Live game browser — subscribe to open lobbies while on this screen.
  useEffect(() => { watchLobbies(); return () => unwatchLobbies(); }, [watchLobbies, unwatchLobbies]);

  // Pending game invites from friends.
  useEffect(() => { if (!myUid) return; return subscribeInvites(myUid, setInvites); }, [myUid]);

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

  const name = (profile?.username ?? "").trim();
  const canProceed = name.length > 0;
  const busy = status === "connecting";

  async function handleCreate() {
    if (!canProceed || busy) return;
    // Forward the FULL rules object — previously draftPoolSize + augmentsEnabled were
    // dropped here and only patched back by a racy lobby heal effect.
    await host(name, rules);
  }

  return (
    <div className="min-h-screen flex flex-col app-bg">
      {/* Top nav bar */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-white/[0.06] bg-slate-950/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]"><PokeballIcon size={26} /></span>
          <span className="font-extrabold tracking-tight text-xl">Poké<span className="gild-text">TFT</span></span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setLeaderboardOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-amber-300 uppercase tracking-wide"><Trophy size={13} /> {lang === "fr" ? "Classement" : "Ranks"}</button>
          <button onClick={openNews} aria-label={lang === "fr" ? "Nouveautés" : "What's new"} className="relative inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-emerald-300 uppercase tracking-wide"><Megaphone size={13} /> {lang === "fr" ? "Actus" : "News"}{unseenNews && <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}</button>
          <button onClick={() => setHowTo(true)} className="text-xs font-bold text-slate-400 hover:text-sky-300 uppercase tracking-wide">{t.w_how_to_play}</button>
          {showGetApp && <a href="/download" className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 uppercase tracking-wide"><Download size={13} /> {lang === "fr" ? "App" : "Get app"}</a>}
          {/* Profile chip */}
          <div className="flex items-center gap-2.5 pl-3 border-l border-slate-800">
            <span className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              {profile?.photoURL
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.photoURL} alt="" width={30} height={30} style={{ imageRendering: "pixelated" }} />
                : <span className="text-sm font-extrabold text-slate-500">{(name || "?").slice(0, 1).toUpperCase()}</span>}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-amber-300">{profile?.username}</span>
              <span className="flex gap-2 text-[10px]">
                <button onClick={() => setProfileOpen(true)} className="text-amber-400 hover:text-amber-300 font-semibold">{t.w_profile}</button>
                <button onClick={() => setEditProfile(true)} className="text-sky-400 hover:text-sky-300">Edit</button>
                <button onClick={signOut} className="text-slate-500 hover:text-rose-400">Sign out</button>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Friend invites */}
      {invites.length > 0 && (
        <div className="w-full max-w-[940px] mx-auto px-4 sm:px-6 pt-3 flex flex-col gap-2">
          {invites.map((inv) => (
            <div key={inv.code} className="panel rounded-xl px-4 py-2.5 flex items-center gap-3 border-amber-500/25">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="flex-1 min-w-0 text-[13px] text-slate-200 truncate">
                <span className="font-bold text-amber-300">{inv.from}</span> {lang === "fr" ? "vous invite à jouer" : "invited you to a game"}
              </span>
              <button
                onClick={() => { if (canProceed) join(inv.code, name); if (myUid) { clearInvite(myUid, inv.code); clearInvitePlaceholder(inv.code, myUid); } }}
                disabled={!canProceed || busy}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-bold disabled:opacity-40"
              >{lang === "fr" ? "Rejoindre" : "Join"}</button>
              <button onClick={() => { if (myUid) { clearInvite(myUid, inv.code); clearInvitePlaceholder(inv.code, myUid); } }} className="text-slate-500 hover:text-slate-300 text-lg leading-none px-1">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Main */}
      <div className="flex-1 w-full max-w-[940px] mx-auto flex flex-col lg:flex-row gap-5 p-4 sm:p-6 items-stretch">
        {/* Hero / play */}
        <main className="flex-1 flex flex-col min-h-[420px]">
          <div className="panel-hero flex-1 flex flex-col justify-center items-center gap-7 rounded-xl p-8 relative overflow-hidden">
            {/* Decorative floating mons */}
            <div className="absolute inset-0 pointer-events-none select-none">
              {heroMons.map((m, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={spriteUrl(m.dex)} alt="" width={m.size} height={m.size}
                  className="absolute hero-float" style={{ left: m.x, top: m.y, width: m.size, ["--r" as string]: `${m.rot}deg`, imageRendering: "pixelated", opacity: 0.06, filter: "saturate(1.05)", animationDelay: `${i * 0.6}s` }} />
              ))}
            </div>

            <div className="text-center relative z-10">
              <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-300/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {lobbies.length} {lobbies.length === 1 ? "lobby" : "lobbies"} live
              </div>
              <h1 className="font-bold tracking-tight text-3xl sm:text-5xl text-slate-100">{t.w_hero_title}</h1>
              <p className="text-slate-500 text-[13px] mt-2.5">{t.w_subtitle}</p>
            </div>

            <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                <button data-testid="create-game" onClick={handleCreate} disabled={!canProceed || busy}
                  className="w-full py-3 rounded-xl font-bold text-[15px] tracking-wide bg-amber-500/95 hover:bg-amber-400 text-black disabled:opacity-30 transition-colors">
                  {busy ? "…" : <span className="inline-flex items-center justify-center gap-2"><Swords size={17} /> {t.w_create_btn}</span>}
                </button>

                {/* Live game browser — find + join an open game without a code. */}
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{t.w_open_games}</span>
                    <span className="text-[10px] text-slate-600 tabular-nums">{lobbies.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[176px] overflow-y-auto pr-0.5">
                    {lobbies.length === 0 ? (
                      <p className="text-[11px] text-slate-600 text-center py-3 rounded-lg border border-dashed border-slate-800">{t.w_no_games}</p>
                    ) : lobbies.map((l) => {
                      const full = l.players >= l.max;
                      return (
                        <button key={l.code} onClick={() => join(l.code, name)} disabled={!canProceed || busy || full}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 transition-colors text-left">
                          <span className="flex flex-col items-start min-w-0">
                            <span className="text-xs font-bold text-slate-200 truncate max-w-[160px]">{l.host}</span>
                            <span className="text-[10px] text-slate-500 truncate max-w-[160px]">{(l.gens ?? []).map((g) => GEN_NAMES[g] ?? `G${g}`).join(" · ") || "—"}</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`text-[11px] tabular-nums ${full ? "text-rose-400" : "text-slate-400"}`}>{l.players}/{l.max}</span>
                            <span className="text-[10px] font-extrabold uppercase text-sky-300">{t.w_join_btn}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {netError && (
                  <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                    <AlertTriangle size={14} className="shrink-0" /> {netError}
                  </div>
                )}
              </div>
          </div>
        </main>

        {/* Right rail: profile + friends + settings */}
        <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-4">
          <ProfileTile />
          <FriendsPanel />
          <div className="panel rounded-xl p-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3 border-b border-white/[0.06] pb-2.5">{t.s_title}</h2>
            <AppSettingsPanel />
          </div>
        </aside>
      </div>

      {editProfile && <ProfileEditor onClose={() => setEditProfile(false)} />}
      {howTo && <HowToPlay onClose={() => setHowTo(false)} />}
      {news && <NewsModal onClose={() => setNews(false)} />}
    </div>
  );
}
