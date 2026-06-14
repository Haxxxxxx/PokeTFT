"use client";

import { useEffect } from "react";
import { useRoom } from "@/game/net/roomStore";
import { useAuth } from "@/game/net/authStore";
import { startServerTime } from "@/game/net/serverTime";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { LobbyScreen } from "@/components/lobby/LobbyScreen";
import { NetGameClient } from "@/components/game/NetGameClient";
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
  const reconnecting = useRoom((s) => s.reconnecting);
  const reconnect = useRoom((s) => s.reconnect);

  useEffect(() => { initAuth(); startServerTime(); }, [initAuth]);
  // Only try to reconnect to a saved room once we're authenticated.
  useEffect(() => { if (authStatus === "ready") reconnect(); }, [authStatus, reconnect]);

  // Was a game in progress before a refresh? Show the loader until reconnect
  // resolves, so we never flash the home screen on the way back into a match.
  const hadSavedRoom = typeof window !== "undefined" && !!window.sessionStorage.getItem("poketft_room");

  let view;
  if (authStatus === "loading") view = <LoadingScreen label="Signing in…" />;
  else if (authStatus === "signed-out") view = <SignInScreen />;
  else if (authStatus === "needs-username") view = <UsernamePrompt />;
  else if (reconnecting || (hadSavedRoom && (!code || !room))) view = <LoadingScreen label="Rejoining your game…" />;
  else if (!code || !room) view = <WelcomeScreen />;
  else if (room.meta?.phase === "lobby") view = <LobbyScreen />;
  else view = <NetGameClient />;

  return <ErrorBoundary>{view}</ErrorBoundary>;
}
