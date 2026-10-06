// Fixed cuboid colliders built from the layout data (design 2.8). Cuboids only.
import type RAPIER from "@dimforge/rapier3d-compat";
import { blockQuaternion, type Layout } from "./layout";

type Rapier = typeof RAPIER;

export const GROUP_WORLD = 0x0001;
export const GROUP_CAMERA_BLOCKER = 0x0002;
export const GROUP_PLAYER = 0x0004;

/** Builds the fixed colliders and returns a function that removes them again. */
export function buildColliders(rapier: Rapier, world: RAPIER.World, layout: Layout): () => void {
  const bodies: RAPIER.RigidBody[] = [];
  for (const b of layout.blocks) {
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(b.center.x, b.center.y, b.center.z).setRotation(blockQuaternion(b))
    );
    bodies.push(body);
    const membership = GROUP_WORLD | (b.blocksCamera ? GROUP_CAMERA_BLOCKER : 0);
    world.createCollider(
      rapier.ColliderDesc.cuboid(b.size.x / 2, b.size.y / 2, b.size.z / 2).setCollisionGroups(
        (membership << 16) | (GROUP_WORLD | GROUP_PLAYER)
      ),
      body
    );
  }
  return () => {
    for (const b of bodies) {
      try {
        world.removeRigidBody(b); // removes its colliders too
      } catch {
        /* the world was already released */
      }
    }
    bodies.length = 0;
  };
}
