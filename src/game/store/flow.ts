/** Round orchestration across the game, combat, and lobby stores. */

import { useGame } from "./gameStore";
import { useCombat } from "./combatStore";
import { useLobby } from "./lobbyStore";

/** Begin the human's combat against the next rival in the lobby. */
export function startCombatFlow(): void {
  const game = useGame.getState();
  if (useCombat.getState().result) return; // already fighting
  if (game.health <= 0) return;
  const board = game.units.filter((u) => u.pos !== null);
  if (board.length === 0) return;

  const opp = useLobby.getState().pickOpponent();
  if (!opp) return;
  useCombat.getState().start(board, opp.board, game.stage, game.round, opp.id, opp.name);
}

/** Apply the fight result to the human + the whole lobby, then advance the round. */
export function resolveCombatFlow(won: boolean, survivors: number): void {
  const combat = useCombat.getState();
  const { opponentId, result } = combat;
  const combatStage = useGame.getState().stage;

  useGame.getState().endRound(won, survivors);
  const after = useGame.getState();

  if (opponentId && result) {
    useLobby.getState().resolveRound(opponentId, result, combatStage, after.stage, after.round);
  }
  combat.clear();
}
