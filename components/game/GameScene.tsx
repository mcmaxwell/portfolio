"use client";

// In-canvas root of the game (design 4.2). Contains the single useFrame (the frame
// driver). Physics from @react-three/rapier provides WASM init and world lifetime only;
// stepping is done here at a fixed rate.
import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import * as THREE from "three";
import type { CharacterAnimator } from "./animator";
import type { GameAssets } from "./clips";
import { CAMERA, FEET_TO_CENTER, MOTOR_CONFIG, MOVEMENT, PHYSICS, QUALITY, type Vec3 } from "./config";
import { createFixedStepper, type FixedStepper } from "./fixedStep";
import { createFollowCamera, type FollowCamera } from "./followCamera";
import { GameAvatar } from "./GameAvatar";
import { cameraRelativeMove, createPlayerMotor, type MotorIntent, type MotorState, type PlayerMotor } from "./player";
import type { GameHandle } from "./session";
import { buildColliders } from "./world/colliders";
import { TEST_ARENA, type Layout } from "./world/layout";
import { WorldView } from "./world/WorldView";

export type GameSceneProps = {
  game: GameHandle;
  assets: GameAssets | null;
  active: boolean;
  avatarUrl: string;
  layout?: "test-arena" | "campus";
  onPhysics: (r: "ready" | Error) => void;
  onExit: () => void;
};

function layoutFor(name: GameSceneProps["layout"]): Layout {
  // CAMPUS arrives in M3; until then every name resolves to the test arena.
  void name;
  return TEST_ARENA;
}

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

/** Reports that the Physics provider finished its WASM init (children mount only then). */
function PhysicsReady({ onReady }: { onReady: () => void }) {
  useRapier();
  const ref = useRef(onReady);
  ref.current = onReady;
  useEffect(() => ref.current(), []);
  return null;
}

type Runtime = {
  motor: PlayerMotor;
  stepper: FixedStepper;
  cam: FollowCamera;
  intent: MotorIntent;
  frame: MotorState;
  tmp: Vec3;
  charYaw: number;
};

function ActiveGame({ game, assets, avatarUrl, layoutName }: { game: GameHandle; assets: GameAssets | null; avatarUrl: string; layoutName: GameSceneProps["layout"] }) {
  const { rapier, world } = useRapier();
  const { camera, gl } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const animatorRef = useRef<CharacterAnimator | null>(null);
  const runtime = useRef<Runtime | null>(null);
  const layout = layoutFor(layoutName);
  // Shadows need renderer setup that belongs to M5 (quality presets); M1 renders without.
  const quality = QUALITY.low;

  useEffect(() => {
    world.timestep = PHYSICS.dt;
    const removeColliders = buildColliders(rapier, world, layout);
    const spawnCenter = { x: layout.spawn.x, y: layout.spawn.y + FEET_TO_CENTER, z: layout.spawn.z };
    const motor = createPlayerMotor(rapier, world, spawnCenter, MOTOR_CONFIG);
    const cam = createFollowCamera(camera as THREE.PerspectiveCamera, null, CAMERA);
    const yaw = (layout.spawnYawDeg * Math.PI) / 180;
    cam.snapTo(spawnCenter, yaw);
    game.input.attach(gl.domElement);
    runtime.current = {
      motor,
      stepper: createFixedStepper(PHYSICS),
      cam,
      intent: { moveWorld: { x: 0, z: 0 }, run: false, jump: false },
      frame: { ...motor.state, position: { ...motor.state.position } },
      tmp: { x: 0, y: 0, z: 0 },
      charYaw: yaw,
    };
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
  }, [rapier, world, camera, gl, game, layout]);

  useFrame((_, delta) => {
    const rt = runtime.current;
    if (!rt || game.disposed) return;
    const snap = game.input.sample();
    const move = cameraRelativeMove(snap.move, rt.cam.yaw);
    rt.intent.moveWorld = move;
    rt.intent.run = snap.run;
    rt.intent.jump ||= snap.jump;

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
    rt.frame.jumpedThisStep = jumped;
    rt.frame.landedThisStep = landed;
    rt.frame.respawnedThisStep = respawned;

    const pos = rt.motor.interpolated(alpha, rt.tmp);
    const dtc = Math.min(delta, 0.1);
    // Visual yaw eases toward the movement direction while actually moving.
    if (s.horizontalSpeed > 0.3 && Math.hypot(move.x, move.z) > 0.1) {
      const target = Math.atan2(move.x, move.z);
      const diff = Math.atan2(Math.sin(target - rt.charYaw), Math.cos(target - rt.charYaw));
      rt.charYaw += diff * (1 - Math.exp(-MOVEMENT.turnRate * dtc));
    }
    const g = groupRef.current;
    if (g) {
      g.position.set(pos.x, pos.y - FEET_TO_CENTER, pos.z);
      g.rotation.y = rt.charYaw;
    }
    animatorRef.current?.update(dtc, rt.frame);
    if (respawned) rt.cam.snapTo(pos, rt.charYaw);
    else rt.cam.update(dtc, pos, s.grounded, rt.charYaw, snap.look, snap.recenter);
  });

  return (
    <>
      <WorldView layout={layout} quality={quality} />
      <GameAvatar url={avatarUrl} assets={assets} groupRef={groupRef} animatorRef={animatorRef} castShadow={quality.shadows} />
    </>
  );
}

export function GameScene({ game, assets, active, avatarUrl, layout, onPhysics }: GameSceneProps) {
  const cb = useRef(onPhysics);
  cb.current = onPhysics;
  return (
    <GameErrorBoundary onError={(e) => cb.current(e)}>
      <Suspense fallback={null}>
        <Physics paused gravity={[0, 0, 0]} colliders={false}>
          <PhysicsReady onReady={() => cb.current("ready")} />
          {active && <ActiveGame game={game} assets={assets} avatarUrl={avatarUrl} layoutName={layout} />}
        </Physics>
      </Suspense>
    </GameErrorBoundary>
  );
}
