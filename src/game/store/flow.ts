/** Round orchestration across the game, combat, lobby, and carousel stores. */

import { roundKind } from "../config";
import { MEGA_STONE } from "../data/mega";
import { generateCreepBoard, pickCarouselOptions } from "../engine/enemy";
import { useGame } from "./gameStore";
import { useCombat } from "./combatStore";
import { useLobby } from "./lobbyStore";
import { useCarousel } from "./carouselStore";
import { useUi } from "./uiStore";

/** Advance the current round: start the right kind of phase (PvP / PvE / carousel). */
export function advanceFlow(): void {
  const game = useGame.getState();
  if (useCombat.getState().result) return;     // mid-combat
  if (useCarousel.getState().options) return;  // mid-carousel
  if (game.health <= 0) return;

  const kind = roundKind(game.stage, game.round);
  const board = game.units.filter((u) => u.pos !== null);

  // Snap back to your own board for the phase you're about to play.
  useUi.getState().setView(null);

  if (kind === "carousel") {
    // Always offer a Mega Stone alongside four unit choices (opportunity cost).
    const units = pickCarouselOptions(game.stage, game.stage * 31 + game.round, 4);
    useCarousel.getState().open([MEGA_STONE, ...units]);
    return;
  }

  // An empty board simply loses the fight (no soft-lock) — fair for PvP, harmless
  // for PvE since PvE never costs HP.
  if (kind === "pve") {
    const creeps = generateCreepBoard(game.stage, game.round, game.stage * 17 + game.round);
    useCombat.getState().start(board, creeps, "pve", null, "Wild Pokémon");
    return;
  }

  // PvP
  const opp = useLobby.getState().pickOpponent();
  if (!opp) return;
  useCombat.getState().start(board, opp.board, "pvp", opp.id, opp.name);
}

/** Apply a finished combat to the world and advance the round. */
export function resolveCombatFlow(won: boolean, survivors: number): void {
  const combat = useCombat.getState();
  const { mode, opponentId, result } = combat;
  const combatStage = useGame.getState().stage;

  try {
    if (mode === "pve") {
      useGame.getState().pveReward(won);
      const after = useGame.getState();
      useLobby.getState().advanceOnly(after.stage, after.round);
    } else {
      useGame.getState().endRound(won, survivors);
      const after = useGame.getState();
      if (opponentId && result) {
        useLobby.getState().resolveRound(opponentId, result, combatStage, after.stage, after.round);
      }
    }
  } finally {
    combat.clear();
  }
}

/** Take a carousel pick and advance the round. */
export function resolveCarouselFlow(defId: string): void {
  try {
    useGame.getState().carouselTake(defId);
    const after = useGame.getState();
    useLobby.getState().advanceOnly(after.stage, after.round);
  } finally {
    useCarousel.getState().clear();
  }
}
