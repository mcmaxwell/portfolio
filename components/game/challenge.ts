// The exploration challenge (M4): collect one energy cell at each destination, then light the beacon.
// Rules only: it reads the player's feet position and writes progress and the session. Cells are
// collected by walking into them (no key, so touch needs no extra button); the beacon is a normal
// interactable that answers only after the third cell. No DOM, no three, no Rapier.
import type { Interactable, Vec3 } from "./config";
import { REACH_Y } from "./interactions";
import { canActivateBeacon, collectCell, completeChallenge } from "./progress";
import type { GameHandle } from "./session";
import type { Challenge } from "./world/layout";

export interface ChallengeSystem {
  /** Call every frame with the player's feet position: collects the cells in reach while playing. */
  update(player: Vec3): void;
  /** True while the beacon should answer (all three cells, not yet completed). */
  beaconReady(): boolean;
  /** For the interaction system: the beacon starts the celebration only when ready; a cell or other item does nothing. */
  activate(item: Interactable): void;
}

const inReach = (player: Vec3, cell: Interactable) =>
  Math.hypot(cell.position.x - player.x, cell.position.z - player.z) <= cell.radius && Math.abs(cell.position.y - player.y) <= REACH_Y;

export function createChallenge(challenge: Challenge, game: Pick<GameHandle, "session" | "progress">): ChallengeSystem {
  const { session, progress } = game;
  return {
    update(player) {
      if (session.getState().mode !== "playing") return;
      for (const cell of challenge.cells) {
        if (cell.cellId && inReach(player, cell)) progress.update((p) => collectCell(p, cell.cellId!));
      }
    },
    beaconReady: () => canActivateBeacon(progress.getState()),
    activate(item) {
      if (item.kind !== "beacon" || session.getState().mode !== "playing") return;
      if (!canActivateBeacon(progress.getState())) return;
      progress.update(completeChallenge); // saved at once, so a reload during the celebration keeps it
      session.dispatch({ type: "BEACON_ACTIVATED" });
    },
  };
}
