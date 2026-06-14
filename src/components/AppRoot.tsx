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
  const reconnect = useRoom((s) => s.reconnect);

  useEffect(() => { initAuth(); startServerTime(); }, [initAuth]);
  // Only try to reconnect to a saved room once we're authenticated.
  useEffect(() => { if (authStatus === "ready") reconnect(); }, [authStatus, reconnect]);

  let view;
  if (authStatus === "loading") view = <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading…</div>;
  else if (authStatus === "signed-out") view = <SignInScreen />;
  else if (authStatus === "needs-username") view = <UsernamePrompt />;
  else if (!code || !room) view = <WelcomeScreen />;
  else if (room.meta?.phase === "lobby") view = <LobbyScreen />;
  else view = <NetGameClient />;

  return <ErrorBoundary>{view}</ErrorBoundary>;
}
