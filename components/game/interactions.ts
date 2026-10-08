// Interaction system (design 2.9): which interactable the player is near and facing, and what
// pressing the interact key does. No DOM, no three, no Rapier; the focus lives in a tiny store
// the interface reads, so the frame driver never touches React state.
import type { Interactable, Vec3 } from "./config";
import type { GameHandle, Store } from "./session";

export type { Interactable };

/** How far above or below the player's feet an item still counts as reachable (another floor does not). */
export const REACH_Y = 1.6;
/** A focused item stays focused while the player is a little beyond its radius (no flicker at the edge). */
const EDGE_HYSTERESIS = 0.15;
/** A new item must be this much nearer than the focused one to take over (no flicker between two close items). */
const SWITCH_MARGIN = 0.35;

type Candidate = { item: Interactable; dist: number; front: boolean };

function candidate(player: Vec3, facingYaw: number, item: Interactable, extra: number): Candidate | null {
  const dx = item.position.x - player.x;
  const dz = item.position.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist > item.radius + extra) return null;
  if (Math.abs(item.position.y - player.y) > REACH_Y) return null;
  // In front of the character: the item is on the facing side (an item underfoot counts as in front).
  const front = dist < 0.05 || dx * Math.sin(facingYaw) + dz * Math.cos(facingYaw) > 1e-9;
  return { item, dist, front };
}

/**
 * The item to act on: the nearest one in reach that the character is facing; if none is in
 * front, the nearest one behind. Items for which `available` is false are skipped. Ties go to
 * the first item in the list.
 */
export function pickFocus(
  player: Vec3,
  facingYaw: number,
  items: readonly Interactable[],
  available: (i: Interactable) => boolean
): Interactable | null {
  let front: Candidate | null = null;
  let behind: Candidate | null = null;
  for (const item of items) {
    if (!available(item)) continue;
    const c = candidate(player, facingYaw, item, 0);
    if (!c) continue;
    if (c.front) {
      if (!front || c.dist < front.dist) front = c;
    } else if (!behind || c.dist < behind.dist) behind = c;
  }
  return (front ?? behind)?.item ?? null;
}

export interface InteractionSystem {
  /** Call every frame with the player's feet position, the character's facing and the interact edge. */
  update(player: Vec3, facingYaw: number, interactPressed: boolean): void;
  readonly focused: Store<Interactable | null>;
  /** The nearest item in reach that is `hintable` but not focusable, or null (only meaningful when nothing is focused). */
  readonly hinted: Store<Interactable | null> | null;
  /** Clears the focus (the prompt disappears). */
  dispose(): void;
}

/**
 * Focus follows the player only while playing: any other mode (entering, panel, paused, ...)
 * clears it, so a prompt never shows over a panel or a pause menu. Interacting with an item that
 * has a panel opens it; the beacon has none and goes to `onActivate` (challenge.ts). Cells are collected by
 * proximity in challenge.ts and are never offered here.
 */
export function createInteractionSystem(
  items: readonly Interactable[],
  game: Pick<GameHandle, "session" | "focus"> & Partial<Pick<GameHandle, "hint">>,
  available: (i: Interactable) => boolean = () => true,
  /** Called for the focused item when the key is pressed and it has no panel (the beacon). */
  onActivate?: (item: Interactable) => void,
  /** Items that, while not available, still earn a non-interactive hint when the player is next to them. */
  hintable: (i: Interactable) => boolean = () => false
): InteractionSystem {
  const { session, focus } = game;
  const hint = game.hint ?? null;
  const nearestHint = (player: Vec3, facingYaw: number): Interactable | null => {
    let best: Candidate | null = null;
    const current = hint?.getState() ?? null;
    for (const item of items) {
      if (available(item) || !hintable(item)) continue;
      const c = candidate(player, facingYaw, item, current?.id === item.id ? EDGE_HYSTERESIS : 0);
      if (c && (!best || c.dist < best.dist)) best = c;
    }
    return best?.item ?? null;
  };
  return {
    focused: focus,
    hinted: hint,
    update(player, facingYaw, interactPressed) {
      if (session.getState().mode !== "playing") {
        focus.set(null);
        hint?.set(null);
        return;
      }
      let next = pickFocus(player, facingYaw, items, available);
      const current = focus.getState();
      if (current && next && current.id !== next.id && available(current)) {
        // Keep the current item unless the newcomer is clearly nearer.
        const keep = candidate(player, facingYaw, current, EDGE_HYSTERESIS);
        const nextC = candidate(player, facingYaw, next, 0);
        if (keep && nextC && keep.front === nextC.front && keep.dist <= nextC.dist + SWITCH_MARGIN) next = current;
      } else if (current && !next && available(current) && candidate(player, facingYaw, current, EDGE_HYSTERESIS)) {
        next = current;
      }
      focus.set(next);
      if (hint) hint.set(next ? null : nearestHint(player, facingYaw));
      if (interactPressed && next) {
        if (next.panel) session.dispatch({ type: "OPEN_PANEL", panel: next.panel });
        else onActivate?.(next);
      }
    },
    dispose() {
      focus.set(null);
      hint?.set(null);
    },
  };
}
