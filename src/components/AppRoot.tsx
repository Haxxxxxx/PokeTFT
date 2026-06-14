"use client";

import { useEffect } from "react";
import { useRoom } from "@/game/net/roomStore";
import { startServerTime } from "@/game/net/serverTime";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { LobbyScreen } from "@/components/lobby/LobbyScreen";
import { NetGameClient } from "@/components/game/NetGameClient";

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

  if (!code || !room) return <WelcomeScreen />;
  if (room.meta?.phase === "lobby") return <LobbyScreen />;
  return <NetGameClient />;
}
