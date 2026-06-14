"use client";

import { useRoom } from "@/game/net/roomStore";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { LobbyScreen } from "@/components/lobby/LobbyScreen";
import { GameClient } from "@/components/game/GameClient";

/**
 * Top-level switch driven by the networked room:
 *  - no room  → Welcome (host / join by code)
 *  - lobby    → Lobby (live players, ready, host start)
 *  - playing  → the game
 */
export function AppRoot() {
  const code = useRoom((s) => s.code);
  const room = useRoom((s) => s.room);

  if (!code || !room) return <WelcomeScreen />;
  if (room.meta?.phase === "playing") {
    return <GameClient playerCount={room.rules?.maxPlayers ?? 8} startingHp={room.rules?.startingHp ?? 100} />;
  }
  return <LobbyScreen />;
}
