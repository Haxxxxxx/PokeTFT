"use client";

import { useEffect } from "react";
import { useRoom } from "@/game/net/roomStore";
import { startServerTime } from "@/game/net/serverTime";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { LobbyScreen } from "@/components/lobby/LobbyScreen";
import { NetGameClient } from "@/components/game/NetGameClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Top-level switch driven by the networked room:
 *  - no room        → Welcome (host / join by code)
 *  - phase "lobby"  → Lobby (live players, ready, host start)
 *  - else           → the live multiplayer match (planning / combat / over)
 */
export function AppRoot() {
  const code = useRoom((s) => s.code);
  const room = useRoom((s) => s.room);
  const reconnect = useRoom((s) => s.reconnect);

  useEffect(() => {
    startServerTime();
    reconnect();
  }, [reconnect]);

  return (
    <ErrorBoundary>
      {!code || !room ? <WelcomeScreen /> : room.meta?.phase === "lobby" ? <LobbyScreen /> : <NetGameClient />}
    </ErrorBoundary>
  );
}
