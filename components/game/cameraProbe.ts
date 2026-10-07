// Obstacle query for the follow camera: a sphere cast against the camera-blocking colliders
// (design 2.7). Plain Rapier, no React.
import type RAPIER from "@dimforge/rapier3d-compat";
import type { ObstacleQuery } from "./followCamera";
import { GROUP_CAMERA_BLOCKER, GROUP_PLAYER } from "./world/colliders";

type Rapier = typeof RAPIER;

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Builds the camera query. Only colliders in GROUP_CAMERA_BLOCKER are hit.
 * `stopAtPenetration` is false on purpose: when the probe starts inside a blocker (the pivot
 * brushes a slab edge during a drop) Rapier lets it move out instead of reporting a hit at
 * distance 0, so the camera cannot get stuck at the pivot.
 * The shape is cached per radius.
 */
export function createObstacleQuery(rapier: Rapier, world: RAPIER.World): ObstacleQuery {
  const balls = new Map<number, RAPIER.Ball>();
  const dir = { x: 0, y: 0, z: 0 };
  return (from, to, radius) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    dir.x = dx / len;
    dir.y = dy / len;
    dir.z = dz / len;
    let ball = balls.get(radius);
    if (!ball) {
      ball = new rapier.Ball(radius);
      balls.set(radius, ball);
    }
    const hit = world.castShape(
      from,
      IDENTITY,
      dir,
      ball,
      0,
      len,
      false,
      undefined,
      (GROUP_PLAYER << 16) | GROUP_CAMERA_BLOCKER
    );
    return hit ? hit.time_of_impact : null;
  };
}
