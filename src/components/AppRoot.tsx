"use client";

import { useEffect } from "react";
import { useRoom } from "@/game/net/roomStore";
import { useAuth } from "@/game/net/authStore";
import { startServerTime } from "@/game/net/serverTime";
import { music } from "@/lib/audio";
import { useAppStore } from "@/game/store/appStore";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { LobbyScreen } from "@/components/lobby/LobbyScreen";
import { NetGameClient } from "@/components/game/NetGameClient";
import { OrientationGate } from "@/components/game/OrientationGate";
import { FirstMatchCoach } from "@/components/game/FirstMatchCoach";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { LeaderboardScreen } from "@/components/profile/LeaderboardScreen";
import { SignInScreen } from "@/components/auth/SignInScreen";
import { UsernamePrompt } from "@/components/auth/UsernamePrompt";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Auth gate → networked room switch:
 *  - not signed in   → Sign in (Google / email / guest)
 *  - no username yet → pick a username
 *  - no room         → Welcome (host / join + friends)
 *  - phase "lobby"   → Lobby
 *  - else            → the live match
 */
export function AppRoot() {
  const initAuth = useAuth((s) => s.init);
  const authStatus = useAuth((s) => s.status);
  const code = useRoom((s) => s.code);
  const room = useRoom((s) => s.room);
  const spectator = useRoom((s) => s.spectator);
  const reconnecting = useRoom((s) => s.reconnecting);
  const reconnect = useRoom((s) => s.reconnect);
  const profileOpen = useAppStore((s) => s.profileOpen);
  const leaderboardOpen = useAppStore((s) => s.leaderboardOpen);

  useEffect(() => { initAuth(); startServerTime(); }, [initAuth]);

  // Ambient music: browsers need a user gesture to start audio, so kick it off on the
  // first pointer interaction, then follow the sound toggle live.
  useEffect(() => {
    const onFirst = () => music.start();
    window.addEventListener("pointerdown", onFirst, { once: true });
    let prevSound = useAppStore.getState().settings.soundEnabled;
    const unsub = useAppStore.subscribe((s) => {
      if (s.settings.soundEnabled !== prevSound) { prevSound = s.settings.soundEnabled; music.sync(); }
    });
    return () => { window.removeEventListener("pointerdown", onFirst); unsub(); };
  }, []);
  // Only try to reconnect to a saved room once we're authenticated.
  useEffect(() => { if (authStatus === "ready") reconnect(); }, [authStatus, reconnect]);

  // Was a game in progress before a refresh? Show the loader until reconnect
  // resolves, so we never flash the home screen on the way back into a match.
  const hadSavedRoom = typeof window !== "undefined" && !!window.sessionStorage.getItem("poketft_room");

  let view;
  let inMatch = false;
  if (authStatus === "loading") view = <LoadingScreen label="Signing in…" />;
  else if (authStatus === "signed-out") view = <SignInScreen />;
  else if (authStatus === "needs-username") view = <UsernamePrompt />;
  else if (reconnecting || (hadSavedRoom && (!code || !room))) view = <LoadingScreen label="Rejoining your game…" />;
  // Profile is checked before the leaderboard so opening a trainer's profile FROM the
  // leaderboard shows it, and "Back" (which clears profileOpen) falls back to the board.
  else if (profileOpen && (!code || !room)) view = <ProfileScreen />;
  else if (leaderboardOpen && (!code || !room)) view = <LeaderboardScreen />;
  else if (!code || !room) view = <WelcomeScreen />;
  // Spectators always get the read-only match view (never the player-facing lobby),
  // for whatever phase the watched game is in.
  else if (spectator) { view = <NetGameClient />; inMatch = true; }
  else if (room.meta?.phase === "lobby") view = <LobbyScreen />;
  else { view = <NetGameClient />; inMatch = true; }

  return (
    <ErrorBoundary>
      {view}
      {/* The fixed-canvas match is the only view that needs landscape — gate it. */}
      {inMatch && <OrientationGate />}
      {/* Learn-by-doing coach for a brand-new trainer's first match (self-dismissing).
          Never for spectators — they have no board of their own to coach. */}
      {inMatch && !spectator && <FirstMatchCoach />}
    </ErrorBoundary>
  );
}
