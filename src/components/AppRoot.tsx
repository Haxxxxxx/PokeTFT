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
  const slots = usePreLobby((s) => s.slots);

  if (phase === "lobby") return <LobbyScreen />;

  // Match the game roster to the players actually in the lobby (filled slots),
  // not the slot capacity.
  const activePlayers = Math.max(2, slots.filter((sl) => sl.type !== "empty").length);
  return <GameClient playerCount={activePlayers} startingHp={rules.startingHp} />;
}
