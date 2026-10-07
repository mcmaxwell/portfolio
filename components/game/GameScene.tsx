"use client";

// In-canvas root of the game (design 4.2). Contains the single useFrame (the frame
// driver). Physics from @react-three/rapier provides WASM init and world lifetime only;
// stepping is done here at a fixed rate.
//
// Lifecycle (play-transition.md): GameScene mounts while the hero is still on stage with
// `active` false. In that warm-up it initialises physics, mounts the world invisibly and
// compiles its shaders, then reports ready. At the swap `active` turns true: the avatar
// appears at the spawn point facing the camera, the camera starts from the hero pose and the
// frame driver runs the entry (turn, walk, camera slide, world reveal). Exit runs it backwards.
import { Component, Suspense, useEffect, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import * as THREE from "three";
import type { CharacterAnimator } from "./animator";
import type { GameAssets } from "./clips";
import { CAMERA, FEET_TO_CENTER, MOTOR_CONFIG, MOVEMENT, PHYSICS, QUALITY, type Vec3 } from "./config";
import { createFixedStepper, type FixedStepper } from "./fixedStep";
import { createObstacleQuery } from "./cameraProbe";
import { createFollowCamera, type FollowCamera } from "./followCamera";
import { GameAvatar } from "./GameAvatar";
import type { PoseBlend } from "./poseBlend";
import { cameraRelativeMove, createPlayerMotor, type MotorIntent, type MotorState, type PlayerMotor } from "./player";
import type { GameHandle } from "./session";
import { TIMING } from "./shell/transition";
import { createYawTween, easeInCubic, easeOutCubic, lerp, shortestAngle, stepYawTween, yawTweenDone, type YawTween } from "./tween";
import { buildColliders } from "./world/colliders";
import { resolveLayout, type Layout } from "./world/layout";
import { WorldView, type WorldHandle } from "./world/WorldView";

export type GameSceneProps = {
  game: GameHandle;
  assets: GameAssets | null;
  active: boolean;
  avatarUrl: string;
  layout?: "test-arena" | "campus";
  onPhysics: (r: "ready" | Error) => void;
  onExit: () => void;
  /** A fault after the game started: lost graphics context or a runtime error in the game tree. */
  onFault: (kind: "context-lost" | "runtime") => void;
  /** The exit leg (camera and avatar back to the hero framing) reached its end. */
  onExitLegDone: () => void;
  /**
   * Opens when the chrome exit has finished. The warm-up (shader compile, a GPU stall of a few
   * hundred ms when the programs were not pre-compiled on hover) waits for it, so it can never
   * freeze the chrome animation.
   */
  warmGate?: boolean;
};

const layoutFor = (name: GameSceneProps["layout"]): Layout => resolveLayout(name);

class GameErrorBoundary extends Component<
  { onError: (e: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Warm-up: rendered inside <Physics>, so it mounts only after the WASM init. Compiles the world's
 * shaders (hidden), then reports physics ready, which completes the load.
 */
function WarmUp({
  worldRef,
  onReady,
  gate,
}: {
  worldRef: MutableRefObject<WorldHandle | null>;
  onReady: () => void;
  gate: boolean;
}) {
  useRapier();
  const ref = useRef(onReady);
  ref.current = onReady;
  useEffect(() => {
    if (!gate) return;
    let cancelled = false;
    (async () => {
      try {
        await worldRef.current?.warm();
      } catch {
        // A failed pre-compile only costs a hitch later; it must not fail the load.
      }
      if (!cancelled) ref.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [worldRef, gate]);
  return null;
}

/** webglcontextlost on the canvas: the game cannot continue (design 3.5). */
function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  const cb = useRef(onLost);
  cb.current = onLost;
  useEffect(() => {
    const el = gl.domElement;
    const handler = (e: Event) => {
      e.preventDefault(); // allows a restore; the game still stops
      cb.current();
    };
    el.addEventListener("webglcontextlost", handler);
    return () => el.removeEventListener("webglcontextlost", handler);
  }, [gl]);
  return null;
}

type Tween = { from: number; to: number; delay: number; duration: number; elapsed: number; ease: (t: number) => number };

type Runtime = {
  motor: PlayerMotor;
  stepper: FixedStepper;
  cam: FollowCamera;
  intent: MotorIntent;
  frame: MotorState;
  tmp: Vec3;
  charYaw: number;
  spawnYaw: number;
  /** Facing used to carry the hero light rig into game coordinates. */
  lightYaw: number;
  yawTween: YawTween | null;
  env: Tween | null;
  envK: number;
  firstFrame: boolean;
  t: number; // seconds of scripted entry
  entry: { skipped: boolean; interrupted: boolean; settle: boolean };
  exit: { started: boolean; t: number; reported: boolean };
};

function ActiveGame({
  game,
  assets,
  avatarUrl,
  layoutName,
  worldRef,
  onExitLegDone,
}: {
  game: GameHandle;
  assets: GameAssets | null;
  avatarUrl: string;
  layoutName: GameSceneProps["layout"];
  worldRef: MutableRefObject<WorldHandle | null>;
  onExitLegDone: () => void;
}) {
  const { rapier, world } = useRapier();
  const { camera, gl } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const animatorRef = useRef<CharacterAnimator | null>(null);
  const poseBlendRef = useRef<PoseBlend | null>(null);
  const runtime = useRef<Runtime | null>(null);
  const layout = layoutFor(layoutName);
  const doneRef = useRef(onExitLegDone);
  doneRef.current = onExitLegDone;
  // Shadows need renderer setup that belongs to M5 (quality presets); M1 renders without.
  const quality = QUALITY.low;

  // A layout effect: the runtime, the avatar placement and the entry camera pose exist before the
  // first game render, so the first game frame equals the last hero frame.
  useLayoutEffect(() => {
    world.timestep = PHYSICS.dt;
    const removeColliders = buildColliders(rapier, world, layout);
    const spawnCenter = { x: layout.spawn.x, y: layout.spawn.y + FEET_TO_CENTER, z: layout.spawn.z };
    const motor = createPlayerMotor(rapier, world, spawnCenter, MOTOR_CONFIG);
    const cam = createFollowCamera(camera as THREE.PerspectiveCamera, createObstacleQuery(rapier, world), CAMERA);
    const spawnYaw = (layout.spawnYawDeg * Math.PI) / 180;
    const reduced = game.reducedMotion;
    // The avatar starts facing the camera (the hero pose) and turns away to face the spawn heading.
    const startYaw = reduced ? spawnYaw : spawnYaw + Math.PI;
    if (reduced) cam.snapTo(spawnCenter, spawnYaw);
    else cam.beginEntry(spawnCenter, startYaw, spawnYaw, CAMERA.entrySeconds);
    game.input.attach(gl.domElement);
    const rt: Runtime = {
      motor,
      stepper: createFixedStepper(PHYSICS),
      cam,
      intent: { moveWorld: { x: 0, z: 0 }, run: false, jump: false },
      frame: { ...motor.state, position: { ...motor.state.position } },
      tmp: { x: 0, y: 0, z: 0 },
      charYaw: startYaw,
      spawnYaw,
      lightYaw: startYaw,
      yawTween: reduced
        ? null
        : createYawTween(
            startYaw,
            spawnYaw,
            (TIMING.entry.turnEndMs - TIMING.entry.turnStartMs) / 1000,
            TIMING.entry.turnStartMs / 1000
          ),
      env: {
        from: 0,
        to: 1,
        delay: 0,
        duration: (reduced ? TIMING.reduced.fadeMs : TIMING.entry.envMs) / 1000,
        elapsed: 0,
        ease: easeOutCubic,
      },
      envK: 0,
      firstFrame: true,
      t: 0,
      entry: { skipped: reduced, interrupted: false, settle: false },
      exit: { started: false, t: 0, reported: false },
    };
    runtime.current = rt;
    worldRef.current?.apply(0, startYaw);
    const g = groupRef.current;
    if (g) {
      g.position.set(layout.spawn.x, layout.spawn.y, layout.spawn.z);
      g.rotation.y = startYaw;
    }
    let done = false;
    const teardown = () => {
      if (done) return;
      done = true;
      runtime.current = null;
      game.input.detach();
      cam.dispose();
      motor.dispose();
      removeColliders();
    };
    game.registerCleanup(teardown);
    return teardown;
  }, [rapier, world, camera, gl, game, layout, worldRef]);

  // Pause (design 2.3): the canvas stops rendering through the Canvas `frameloop` prop, which the
  // shell derives from this same session (an imperative setFrameloop would be undone by the Canvas
  // on its next re-render). Here only the bookkeeping: an entry interrupted by pause is skipped.
  useEffect(() => {
    const sync = () => {
      const s = game.session.getState();
      const rt = runtime.current;
      if (s.mode === "paused" && rt && !rt.entry.skipped) rt.entry.interrupted = true;
      if (s.mode === "playing" && rt && rt.entry.interrupted) {
        rt.entry.settle = true; // settle on the first frame after resume
        rt.entry.interrupted = false;
      }
    };
    sync();
    return game.session.subscribe(sync);
  }, [game]);

  useFrame((_, delta) => {
    const rt = runtime.current;
    if (!rt || game.disposed) return;
    const session = game.session;
    const mode = session.getState().mode;
    const snap = game.input.sample();
    // The first game frame must equal the last hero frame: no time passes on it.
    const dtc = rt.firstFrame ? 0 : Math.min(delta, 0.1);
    rt.firstFrame = false;
    const p0 = rt.motor.state.position;

    // Settle an entry that pause interrupted: snap to the follow pose and the final facing.
    if (rt.entry.settle) {
      rt.entry.settle = false;
      rt.entry.skipped = true;
      rt.yawTween = null;
      rt.charYaw = rt.spawnYaw;
      rt.env = null;
      rt.envK = 1;
      worldRef.current?.apply(1, rt.spawnYaw);
      rt.cam.snapTo(p0, rt.charYaw);
    }

    // Skip the rest of the entry: a mapped key or a touch (play-transition.md 2.7).
    if (mode === "entering" && !rt.entry.skipped) {
      if (Math.hypot(snap.move.x, snap.move.y) > 0.1 || snap.jump || snap.recenter) {
        session.dispatch({ type: "ENTRY_SKIP" });
      }
      if (session.getState().entrySkipped) {
        rt.entry.skipped = true;
        const skipSeconds = TIMING.entry.skipFinishMs / 1000;
        rt.cam.finishEntry(skipSeconds, p0);
        rt.yawTween = createYawTween(rt.charYaw, rt.spawnYaw, skipSeconds);
        rt.env = { from: rt.envK, to: 1, delay: 0, duration: skipSeconds, elapsed: 0, ease: easeOutCubic };
        rt.lightYaw = rt.charYaw;
      }
    }

    // The exit leg begins when the session turns to leaving.
    if (mode === "leaving" && !rt.exit.started) {
      rt.exit.started = true;
      rt.entry.skipped = true;
      if (game.reducedMotion) {
        rt.yawTween = null;
      } else {
        const cp = camera.position;
        const dx = cp.x - p0.x;
        const dz = cp.z - p0.z;
        const bearing = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : rt.charYaw + Math.PI;
        const facing = rt.charYaw + shortestAngle(rt.charYaw, bearing);
        rt.yawTween = createYawTween(rt.charYaw, facing, TIMING.exit.turnMs / 1000);
        rt.cam.beginExit(p0, facing, TIMING.exit.cameraMs / 1000);
        rt.lightYaw = facing;
        rt.env = {
          from: rt.envK,
          to: 0,
          delay: TIMING.exit.envStartMs / 1000,
          duration: (TIMING.exit.envEndMs - TIMING.exit.envStartMs) / 1000,
          elapsed: 0,
          ease: easeInCubic,
        };
      }
    }

    // Scripted entry walk: forward along the spawn heading from S + 500 ms.
    const scripted = mode === "entering" && !rt.entry.skipped;
    if (scripted) rt.t += dtc;
    const live = mode === "playing" || (mode === "entering" && rt.entry.skipped);
    let move: { x: number; z: number };
    if (live) {
      move = cameraRelativeMove(snap.move, rt.cam.yaw);
    } else if (scripted && rt.t >= TIMING.entry.walkStartMs / 1000) {
      move = { x: Math.sin(rt.spawnYaw), z: Math.cos(rt.spawnYaw) };
    } else {
      move = { x: 0, z: 0 };
    }
    rt.intent.moveWorld = move;
    rt.intent.run = live ? snap.run : false;
    if (live) rt.intent.jump ||= snap.jump;

    let jumped = false;
    let landed = false;
    let respawned = false;
    const { alpha } = rt.stepper.advance(delta, (dt) => {
      const s = rt.motor.step(dt, rt.intent);
      world.step();
      rt.motor.capture();
      rt.intent.jump = false;
      jumped ||= s.jumpedThisStep;
      landed ||= s.landedThisStep;
      respawned ||= s.respawnedThisStep;
    });

    const s = rt.motor.state;
    rt.frame.horizontalSpeed = s.horizontalSpeed;
    rt.frame.verticalVelocity = s.verticalVelocity;
    rt.frame.grounded = s.grounded;
    rt.frame.airTime = s.airTime;
    rt.frame.impactSpeed = s.impactSpeed;
    rt.frame.jumpedThisStep = jumped;
    rt.frame.landedThisStep = landed;
    rt.frame.respawnedThisStep = respawned;
    // The walk cross-fade starts before the first step of the scripted walk, so the feet are
    // already moving while the turn finishes (play-transition.md 2.5).
    if (scripted && rt.t >= TIMING.entry.walkFadeStartMs / 1000 && rt.t < TIMING.entry.walkStartMs / 1000) {
      rt.frame.horizontalSpeed = Math.max(rt.frame.horizontalSpeed, 0.3);
    }

    const pos = rt.motor.interpolated(alpha, rt.tmp);
    // Visual yaw: the scripted turns first, otherwise ease toward the movement direction.
    if (rt.yawTween) {
      rt.charYaw = stepYawTween(rt.yawTween, dtc);
      if (yawTweenDone(rt.yawTween)) {
        rt.charYaw = rt.yawTween.to;
        rt.yawTween = null;
      }
    } else if (s.horizontalSpeed > 0.3 && Math.hypot(move.x, move.z) > 0.1) {
      const target = Math.atan2(move.x, move.z);
      const diff = Math.atan2(Math.sin(target - rt.charYaw), Math.cos(target - rt.charYaw));
      rt.charYaw += diff * (1 - Math.exp(-MOVEMENT.turnRate * dtc));
    }
    const g = groupRef.current;
    if (g) {
      g.position.set(pos.x, pos.y - FEET_TO_CENTER, pos.z);
      g.rotation.y = rt.charYaw;
    }

    // World look tween (fog, lights, ground reveal, canvas clear alpha).
    if (rt.env) {
      rt.env.elapsed += dtc;
      const k = rt.env.duration <= 0 ? 1 : (rt.env.elapsed - rt.env.delay) / rt.env.duration;
      rt.envK = lerp(rt.env.from, rt.env.to, rt.env.ease(k));
      worldRef.current?.apply(rt.envK, rt.lightYaw);
      if (k >= 1) rt.env = null;
    }

    animatorRef.current?.update(dtc, rt.frame);
    poseBlendRef.current?.apply(dtc); // hero pose into the game idle, after the mixer wrote this frame

    // Camera.
    const look = live ? snap.look : { dx: 0, dy: 0 };
    if (respawned) rt.cam.snapTo(pos, rt.charYaw);
    else if (mode === "leaving" && game.reducedMotion) {
      // Reduced motion: no camera leg; the pose is held for the short HUD fade.
    } else rt.cam.update(dtc, pos, s.grounded, rt.charYaw, look, snap.recenter && live);

    // Session progress.
    if (mode === "entering") {
      const entryOver = rt.cam.phase === "follow" && !rt.yawTween && !rt.env;
      const timeOver = rt.entry.skipped || rt.t >= TIMING.entry.doneMs / 1000;
      if (entryOver && timeOver) {
        rt.envK = 1;
        worldRef.current?.apply(1, rt.spawnYaw);
        session.dispatch({ type: "ENTRY_DONE" });
      }
    } else if (mode === "leaving" && !rt.exit.reported) {
      rt.exit.t += dtc;
      const over = game.reducedMotion
        ? rt.exit.t >= TIMING.reduced.fadeMs / 1000
        : rt.cam.exitDone && !rt.yawTween && !rt.env;
      if (over) {
        rt.exit.reported = true;
        doneRef.current();
      }
    }
  });

  return (
    <GameAvatar
      url={avatarUrl}
      assets={assets}
      groupRef={groupRef}
      animatorRef={animatorRef}
      poseBlendRef={poseBlendRef}
      blendPose={!game.reducedMotion}
      castShadow={quality.shadows}
    />
  );
}

export function GameScene({ game, assets, active, avatarUrl, layout, onPhysics, onFault, onExitLegDone, warmGate = true }: GameSceneProps) {
  const cb = useRef(onPhysics);
  cb.current = onPhysics;
  const faultCb = useRef(onFault);
  faultCb.current = onFault;
  const activeRef = useRef(active);
  activeRef.current = active;
  const worldRef = useRef<WorldHandle | null>(null);
  const quality = QUALITY.low;
  const layoutData = layoutFor(layout);
  return (
    <GameErrorBoundary
      onError={(e) => {
        // Before the game starts a failure is a physics or warm-up failure; afterwards it is a fault.
        if (activeRef.current) faultCb.current("runtime");
        else cb.current(e);
      }}
    >
      <ContextGuard onLost={() => faultCb.current("context-lost")} />
      <Suspense fallback={null}>
        <WorldView layout={layoutData} quality={quality} active={active} handleRef={worldRef} />
        <Physics paused gravity={[0, 0, 0]} colliders={false}>
          <WarmUp worldRef={worldRef} gate={warmGate} onReady={() => cb.current("ready")} />
          {active && (
            <ActiveGame
              game={game}
              assets={assets}
              avatarUrl={avatarUrl}
              layoutName={layout}
              worldRef={worldRef}
              onExitLegDone={onExitLegDone}
            />
          )}
        </Physics>
      </Suspense>
    </GameErrorBoundary>
  );
}
