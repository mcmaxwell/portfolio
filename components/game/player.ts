// Player controller: a pure TypeScript motor on Rapier's KinematicCharacterController.
// No React, no three, no input devices (design 2.5 and 4). The world and the Rapier
// namespace are injected, so Vitest runs the exact shipped controller in Node.
import type RAPIER from "@dimforge/rapier3d-compat";
import type { MotorConfig, Vec3 } from "./config";
import { GROUP_PLAYER, GROUP_WORLD } from "./world/colliders";

type Rapier = typeof RAPIER;

export type MotorIntent = {
  moveWorld: { x: number; z: number }; // |moveWorld| <= 1
  run: boolean;
  jump: boolean;
};

export type MotorState = {
  position: Vec3; // capsule centre after the last step
  horizontalSpeed: number; // measured from the corrected movement, not from input
  verticalVelocity: number;
  grounded: boolean;
  /** Seconds airborne. Kept through the landing step so the animator can see how long the fall was. */
  airTime: number;
  /**
   * Downward speed (m/s, positive) at the last touchdown. Set on the landing step and kept
   * while grounded, so the animator still sees it if a frame ran several physics steps;
   * reset to 0 as soon as the player is airborne again.
   */
  impactSpeed: number;
  jumpedThisStep: boolean;
  landedThisStep: boolean;
  respawnedThisStep: boolean;
};

export interface PlayerMotor {
  step(dt: number, intent: MotorIntent): MotorState;
  capture(): void;
  interpolated(alpha: number, out: Vec3): Vec3;
  teleport(p: Vec3): void;
  readonly state: MotorState;
  dispose(): void;
}

/** World direction for an input vector (x right, y forward) and a camera yaw (forward = (sin, cos)). */
export function cameraRelativeMove(
  move: { x: number; y: number },
  cameraYaw: number
): { x: number; z: number } {
  const s = Math.sin(cameraYaw);
  const c = Math.cos(cameraYaw);
  return { x: s * move.y - c * move.x, z: c * move.y + s * move.x };
}

/** Horizontal movement length (m) used to probe for a step when the desired movement is shorter. */
const STEP_PROBE = 0.06;

/** Collisions whose surface is steeper than this (radians from up) count as walls, not slopes. */
const WALL_ANGLE = (80 * Math.PI) / 180;

export function createPlayerMotor(
  rapier: Rapier,
  world: RAPIER.World,
  spawn: Vec3,
  cfg: MotorConfig
): PlayerMotor {
  const { capsule } = cfg;
  const spawnPoint: Vec3 = { ...spawn };

  const body = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z)
  );
  const collider = world.createCollider(
    rapier.ColliderDesc.capsule(capsule.halfHeight, capsule.radius).setCollisionGroups(
      (GROUP_PLAYER << 16) | GROUP_WORLD
    ),
    body
  );
  const kcc = world.createCharacterController(capsule.skin);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.setSlideEnabled(true);
  kcc.enableAutostep(cfg.stepHeight, cfg.stepMinWidth, false);
  const slopeRad = (cfg.maxSlopeDeg * Math.PI) / 180;
  kcc.setMaxSlopeClimbAngle(slopeRad);
  kcc.setMinSlopeSlideAngle(slopeRad);
  kcc.enableSnapToGround(cfg.snapDistance);
  kcc.setApplyImpulsesToDynamicBodies(false);

  /**
   * Rapier's setMaxSlopeClimbAngle does not stop the capsule on a too-steep slope when
   * the desired movement is mostly horizontal with a slight downward stick (measured:
   * a 45 degree ramp is climbed 1:1 although the limit is 40, QA finding F1). The limit
   * is enforced here. A rise over a contact steeper than the limit is allowed only up to
   * stepHeight above the last walkable ground (a capsule rolling over a step edge sees
   * steep normals of 60 to 70 degrees, so the normal alone cannot tell a step from a
   * ramp). Beyond that the rise is dropped and the horizontal movement slides along the
   * surface. Vertical faces (walls, step risers) never count as slopes.
   */
  let walkableY = spawn.y;
  const steepContact = (): { x: number; z: number } | null => {
    let steep: { x: number; z: number } | null = null;
    const n = kcc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = kcc.computedCollision(i);
      if (!c) continue;
      const nrm = c.normal1;
      const angle = Math.acos(Math.min(1, Math.max(-1, nrm.y)));
      if (angle > slopeRad + 1e-3 && angle < WALL_ANGLE) steep = { x: nrm.x, z: nrm.z };
    }
    return steep;
  };
  const limitSlopeClimb = (m: Vec3, fromY: number): Vec3 => {
    if (m.y <= 1e-5) return m;
    const steep = steepContact();
    if (!steep) return m;
    if (fromY + m.y - walkableY <= cfg.stepHeight) return m;
    const hl = Math.hypot(steep.x, steep.z);
    if (hl < 1e-6) return { x: m.x, y: 0, z: m.z };
    const nx = steep.x / hl;
    const nz = steep.z / hl;
    const into = Math.min(0, m.x * nx + m.z * nz);
    return { x: m.x - into * nx, y: 0, z: m.z - into * nz };
  };

  const pos: Vec3 = { ...spawn };
  const prev: Vec3 = { ...spawn };
  const curr: Vec3 = { ...spawn };
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let grounded = false;
  let airTime = 0;
  let impactSpeed = 0;
  let sinceGrounded = Infinity;
  let sincePressed = Infinity;
  let disposed = false;
  const jumpSpeed = Math.sqrt(2 * cfg.gravity * cfg.jumpHeight);

  const state: MotorState = {
    position: pos,
    horizontalSpeed: 0,
    verticalVelocity: 0,
    grounded: false,
    airTime: 0,
    impactSpeed: 0,
    jumpedThisStep: false,
    landedThisStep: false,
    respawnedThisStep: false,
  };

  const setPos = (p: Vec3) => {
    pos.x = p.x;
    pos.y = p.y;
    pos.z = p.z;
  };

  const teleport = (p: Vec3) => {
    setPos(p);
    prev.x = curr.x = p.x;
    prev.y = curr.y = p.y;
    prev.z = curr.z = p.z;
    body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    vx = vy = vz = 0;
    grounded = false;
    airTime = 0;
    impactSpeed = 0;
    sinceGrounded = Infinity;
    sincePressed = Infinity;
    kcc.enableSnapToGround(cfg.snapDistance);
    walkableY = p.y;
  };

  return {
    state,
    step(dt, intent) {
      if (disposed) return state;
      state.jumpedThisStep = false;
      state.landedThisStep = false;
      state.respawnedThisStep = false;

      // Jump eligibility: coyote time after leaving ground, buffer after pressing.
      sinceGrounded = grounded ? 0 : sinceGrounded + dt;
      sincePressed = intent.jump ? 0 : sincePressed + dt;
      const wasGrounded = grounded;

      // Horizontal: accelerate toward the target velocity.
      const speed = intent.run ? cfg.runSpeed : cfg.walkSpeed;
      const tx = intent.moveWorld.x * speed;
      const tz = intent.moveWorld.z * speed;
      const accel = (grounded ? cfg.groundAccel : cfg.airAccel) * dt;
      const dx = tx - vx;
      const dz = tz - vz;
      const dl = Math.hypot(dx, dz);
      if (dl <= accel) {
        vx = tx;
        vz = tz;
      } else {
        vx += (dx / dl) * accel;
        vz += (dz / dl) * accel;
      }

      // Vertical: jump, stick to ground, or fall.
      let jumped = false;
      if (
        sincePressed <= cfg.jumpBuffer &&
        sinceGrounded <= cfg.coyoteTime &&
        vy <= 0.001
      ) {
        vy = jumpSpeed;
        jumped = true;
        sinceGrounded = Infinity; // a second jump needs the ground again
        sincePressed = Infinity;
      } else if (grounded) {
        vy = -cfg.groundStickSpeed;
      } else {
        vy = Math.max(vy - cfg.gravity * dt, -cfg.maxFallSpeed);
      }
      if (vy > 0) kcc.disableSnapToGround();
      else kcc.enableSnapToGround(cfg.snapDistance);

      const t = body.translation();
      const want = { x: vx * dt, y: vy * dt, z: vz * dt };
      kcc.computeColliderMovement(collider, want);
      let m: Vec3 = kcc.computedMovement();
      // Rapier's autostep does not engage when the per-step horizontal movement is
      // small (measured: it stalls at walking speed, about 0.027 m per step, and at
      // rest against a step). When a grounded step is blocked, probe with a longer
      // horizontal movement and keep the result only if it stepped up.
      const wantH = Math.hypot(want.x, want.z);
      if (
        wasGrounded &&
        vy <= 0.001 &&
        wantH > 1e-6 &&
        wantH < STEP_PROBE &&
        Math.hypot(m.x, m.z) < wantH * 0.5
      ) {
        const k = STEP_PROBE / wantH;
        kcc.computeColliderMovement(collider, { x: want.x * k, y: want.y, z: want.z * k });
        const probe = kcc.computedMovement();
        if (probe.y > cfg.snapDistance * 0.05) {
          m = { x: probe.x / k, y: probe.y, z: probe.z / k };
        } else {
          kcc.computeColliderMovement(collider, want); // restore the controller's state
        }
      }
      m = limitSlopeClimb(m, t.y);
      const nx = t.x + m.x;
      const ny = t.y + m.y;
      const nz = t.z + m.z;
      state.horizontalSpeed = Math.hypot(m.x, m.z) / dt;

      // Horizontal velocity is kept when blocked: the controller slides and steps every
      // step from the desired movement, and a small desired movement stops autostep working.
      if (vy > 0 && m.y < vy * dt * 0.5) vy = 0; // hit a ceiling

      grounded = !jumped && vy <= 0.001 && kcc.computedGrounded();
      if (grounded) {
        if (!wasGrounded) {
          state.landedThisStep = true; // keep airTime for this step
          impactSpeed = Math.max(0, -vy);
        } else airTime = 0;
      } else {
        airTime += dt;
        impactSpeed = 0;
      }
      if (grounded && vy > 0) vy = 0;
      if (!grounded) walkableY = Math.min(walkableY, ny);
      else if (!steepContact()) walkableY = ny;

      body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
      setPos({ x: nx, y: ny, z: nz });

      if (ny < cfg.killPlaneY) {
        teleport(spawnPoint);
        state.respawnedThisStep = true;
        state.horizontalSpeed = 0;
      }

      state.verticalVelocity = vy;
      state.grounded = grounded;
      state.airTime = airTime;
      state.impactSpeed = impactSpeed;
      state.jumpedThisStep = jumped;
      return state;
    },
    capture() {
      prev.x = curr.x;
      prev.y = curr.y;
      prev.z = curr.z;
      curr.x = pos.x;
      curr.y = pos.y;
      curr.z = pos.z;
    },
    interpolated(alpha, out) {
      const a = Math.min(Math.max(alpha, 0), 1);
      out.x = prev.x + (curr.x - prev.x) * a;
      out.y = prev.y + (curr.y - prev.y) * a;
      out.z = prev.z + (curr.z - prev.z) * a;
      return out;
    },
    teleport,
    dispose() {
      if (disposed) return;
      disposed = true;
      // The world may already have been released (React Strict Mode re-mount, unmount
      // order), in which case there is nothing left to remove.
      try {
        world.removeCharacterController(kcc);
        world.removeCollider(collider, false);
        world.removeRigidBody(body);
      } catch {
        /* already released with the world */
      }
    },
  };
}
