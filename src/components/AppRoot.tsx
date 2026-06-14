"use client";

import { usePreLobby } from "@/game/store/preLobbyStore";
import { LobbyScreen } from "@/components/lobby/LobbyScreen";
import { GameClient } from "@/components/game/GameClient";

/**
 * Top-level switch: Miguel's pre-game lobby (player/rules setup) is the entry
 * screen; once the host launches, we drop into the live game with the chosen
 * rules (player count + starting HP).
 */
export function AppRoot() {
  const phase = usePreLobby((s) => s.phase);
  const rules = usePreLobby((s) => s.rules);

  if (phase === "lobby") return <LobbyScreen />;
  return <GameClient playerCount={rules.maxPlayers} startingHp={rules.startingHp} />;
}
