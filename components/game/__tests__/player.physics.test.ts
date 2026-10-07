// Real Rapier in Node (assumption A5): the compat build embeds the WASM as base64.
import RAPIER from "@dimforge/rapier3d-compat";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { FEET_TO_CENTER, MOTOR_CONFIG, PHYSICS, type Vec3 } from "../config";
import { cameraRelativeMove, createPlayerMotor, type MotorIntent, type PlayerMotor } from "../player";
import { buildColliders } from "../world/colliders";
import { getBlock, TEST_ARENA, type Layout } from "../world/layout";
import { normalizeMove } from "../input";

const DT = PHYSICS.dt;
const worlds: RAPIER.World[] = [];

beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => {
  while (worlds.length) worlds.pop()!.free();
});

const center = (feet: Vec3): Vec3 => ({ x: feet.x, y: feet.y + FEET_TO_CENTER, z: feet.z });
const feetY = (m: PlayerMotor) => m.state.position.y - FEET_TO_CENTER;

function rig(feet: Vec3 = TEST_ARENA.spawn, layout: Layout = TEST_ARENA) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  worlds.push(world);
  buildColliders(RAPIER, world, layout);
  const spawn = center(TEST_ARENA.spawn);
  const motor = createPlayerMotor(RAPIER, world, spawn, MOTOR_CONFIG);
  if (feet !== TEST_ARENA.spawn) motor.teleport(center(feet));
  motor.capture();
  return { world, motor };
}

const IDLE: MotorIntent = { moveWorld: { x: 0, z: 0 }, run: false, jump: false };
const fwd = (run = false): MotorIntent => ({ moveWorld: { x: 0, z: 1 }, run, jump: false });

function tick(r: ReturnType<typeof rig>, intent: MotorIntent) {
  r.motor.step(DT, intent);
  r.world.step();
  r.motor.capture();
}
function run(r: ReturnType<typeof rig>, seconds: number, intent: MotorIntent | (() => MotorIntent)) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) tick(r, typeof intent === "function" ? intent() : intent);
}
const settle = (r: ReturnType<typeof rig>) => run(r, 0.5, IDLE);

describe("player motor on real Rapier", () => {
  it("initializes the compat build in Node (A5) and grounds on flat ground", () => {
    const r = rig({ x: 0, y: 0.3, z: -12 });
    settle(r);
    expect(r.motor.state.grounded).toBe(true);
    expect(feetY(r.motor)).toBeCloseTo(0, 1);
    expect(r.motor.state.verticalVelocity).toBeLessThanOrEqual(0);
  });

  it("does not jump in the air", () => {
    const r = rig({ x: 0, y: 3, z: -12 });
    run(r, 0.1, IDLE);
    expect(r.motor.state.grounded).toBe(false);
    let jumped = false;
    for (let i = 0; i < 10; i++) {
      tick(r, { ...IDLE, jump: true });
      jumped ||= r.motor.state.jumpedThisStep;
    }
    expect(jumped).toBe(false);
    expect(r.motor.state.verticalVelocity).toBeLessThan(0);
  });

  it("jumps about jumpHeight and never more than once while jump is held", () => {
    const r = rig();
    settle(r);
    const ground = feetY(r.motor);
    let jumps = 0;
    let peak = ground;
    const n = Math.round(0.5 / DT);
    for (let i = 0; i < n; i++) {
      tick(r, { ...IDLE, jump: true });
      if (r.motor.state.jumpedThisStep) jumps++;
      peak = Math.max(peak, feetY(r.motor));
    }
    expect(jumps).toBe(1);
    expect(peak - ground).toBeGreaterThan(MOTOR_CONFIG.jumpHeight - 0.1);
    expect(peak - ground).toBeLessThan(MOTOR_CONFIG.jumpHeight + 0.1);
  });

  // The ledge top is at y = 1; walking +x off its edge leaves the ground at a known moment.
  function walkOffLedge() {
    const ledge = getBlock(TEST_ARENA, "ledge-100");
    const r = rig({ x: ledge.center.x, y: 1.2, z: ledge.center.z });
    settle(r);
    expect(r.motor.state.grounded).toBe(true);
    const east: MotorIntent = { moveWorld: { x: 1, z: 0 }, run: false, jump: false };
    for (let i = 0; i < 400 && r.motor.state.grounded; i++) tick(r, east);
    expect(r.motor.state.grounded).toBe(false);
    return { r, east };
  }

  it("allows a jump inside the coyote window and refuses it after", () => {
    const early = walkOffLedge();
    for (let i = 0; i < 3; i++) tick(early.r, early.east); // 0.05 s after leaving
    tick(early.r, { ...early.east, jump: true });
    expect(early.r.motor.state.jumpedThisStep).toBe(true);

    const late = walkOffLedge();
    for (let i = 0; i < 12; i++) tick(late.r, late.east); // 0.2 s after leaving
    // Only the press step is checked: a short fall may land inside the jump buffer
    // later, which is the separate buffered-jump behaviour.
    tick(late.r, { ...late.east, jump: true });
    expect(late.r.motor.state.jumpedThisStep).toBe(false);
    expect(late.r.motor.state.grounded).toBe(false);
    expect(late.r.motor.state.verticalVelocity).toBeLessThan(0);
  });

  it("buffers a jump pressed shortly before landing and ignores an early press", () => {
    // Fall from 0.5 m: about 0.22 s in the air.
    const buffered = rig({ x: 0, y: 0.5, z: -12 });
    run(buffered, 8 * DT, IDLE);
    expect(buffered.motor.state.grounded).toBe(false);
    tick(buffered, { ...IDLE, jump: true });
    let jumped = false;
    for (let i = 0; i < 30 && !jumped; i++) {
      tick(buffered, IDLE);
      jumped = buffered.motor.state.jumpedThisStep;
    }
    expect(jumped).toBe(true);

    const early = rig({ x: 0, y: 0.5, z: -12 });
    run(early, 1 * DT, IDLE);
    tick(early, { ...IDLE, jump: true });
    let earlyJumped = false;
    for (let i = 0; i < 30; i++) {
      tick(early, IDLE);
      earlyJumped ||= early.motor.state.jumpedThisStep;
    }
    expect(earlyJumped).toBe(false);
  });

  it("reports the airborne time on the landing step", () => {
    const r = rig({ x: 0, y: 1, z: -12 });
    let landing: { airTime: number; landed: boolean } | null = null;
    for (let i = 0; i < 120 && !landing; i++) {
      tick(r, IDLE);
      if (r.motor.state.landedThisStep) landing = { airTime: r.motor.state.airTime, landed: true };
    }
    expect(landing).not.toBeNull();
    expect(landing!.airTime).toBeGreaterThan(0.25);
    tick(r, IDLE);
    expect(r.motor.state.airTime).toBe(0);
  });

  it("is blocked by the wall and slides along it", () => {
    const wall = getBlock(TEST_ARENA, "wall");
    const frontFace = wall.center.z - wall.size.z / 2;
    const r = rig({ x: wall.center.x, y: 0, z: -3 });
    settle(r);
    run(r, 3, fwd(true));
    expect(r.motor.state.position.z).toBeLessThanOrEqual(frontFace - 0.3 + 0.01);
    expect(r.motor.state.horizontalSpeed).toBeLessThan(0.3);

    const s = rig({ x: -8, y: 0, z: -3 });
    settle(s);
    const x0 = s.motor.state.position.x;
    // 1.5 s at run speed: long enough to reach the wall and slide along it, short enough to
    // stay on it (the wall is 8 m long and the run speed is 4.8 m/s, so 2 s slid off its end).
    run(s, 1.5, { moveWorld: { x: Math.SQRT1_2, z: Math.SQRT1_2 }, run: true, jump: false });
    expect(s.motor.state.position.z).toBeLessThanOrEqual(frontFace - 0.3 + 0.01);
    expect(s.motor.state.position.x - x0).toBeGreaterThan(1.5);
  });

  it("climbs a 0.2 m step and is blocked by a 0.35 m step", () => {
    const low = getBlock(TEST_ARENA, "step-020");
    const a = rig({ x: low.center.x, y: 0, z: 0.5 });
    settle(a);
    let peak = 0;
    let onTop = 0;
    for (let i = 0; i < 120; i++) {
      tick(a, fwd(false)); // walking speed: autostep must work at slow speeds too
      peak = Math.max(peak, feetY(a.motor));
      if (a.motor.state.grounded && Math.abs(feetY(a.motor) - 0.2) < 0.03) onTop++;
    }
    expect(a.motor.state.position.z).toBeGreaterThan(low.center.z - low.size.z / 2);
    expect(peak).toBeGreaterThan(0.19);
    expect(onTop).toBeGreaterThan(20);

    const high = getBlock(TEST_ARENA, "step-035");
    const b = rig({ x: high.center.x, y: 0, z: 0.5 });
    settle(b);
    run(b, 3, fwd(true));
    expect(b.motor.state.position.z).toBeLessThanOrEqual(high.center.z - high.size.z / 2 - 0.3 + 0.02);
    expect(feetY(b.motor)).toBeCloseTo(0, 1);
  });

  it("climbs a 30 degree ramp", () => {
    const r30 = getBlock(TEST_ARENA, "ramp-30");
    const a = rig({ x: r30.center.x, y: 0, z: 0 });
    settle(a);
    run(a, 1, fwd(false));
    let peak = 0;
    let airborne = 0;
    for (let i = 0; i < 150; i++) {
      tick(a, fwd(false));
      peak = Math.max(peak, feetY(a.motor));
      if (i > 30 && !a.motor.state.grounded) airborne++;
    }
    expect(peak).toBeGreaterThan(1.0);
    expect(airborne).toBe(0);
  });

  // F1/F2: assert the PEAK feet height over the whole run, from start positions near the
  // low end, at walk and run speed. An end-state check is satisfied by climbing and
  // stepping off the top. In the arena the wall (x -10 to -2, z +-0.25) overlaps the
  // ramp-45 approach from 2 m out, so that start would be blocked by the wall and prove
  // nothing: the 2 m start uses a layout with the ground and the same ramp block only.
  const rampOnly: Layout = {
    ...TEST_ARENA,
    blocks: [getBlock(TEST_ARENA, "ground-a"), getBlock(TEST_ARENA, "ramp-45")],
  };
  for (const run_ of [false, true]) {
    for (const dist of [0.5, 1, 2]) {
      it(`never climbs the 45 degree ramp from ${dist} m away (${run_ ? "run" : "walk"})`, () => {
        const r45 = getBlock(TEST_ARENA, "ramp-45");
        const z0 = 2 - dist; // the ramp low end is at z = 2
        const layouts = dist < 2 ? [TEST_ARENA, rampOnly] : [rampOnly];
        for (const layout of layouts) {
          const b = rig({ x: r45.center.x, y: 0, z: z0 }, layout);
          settle(b);
          let peak = 0;
          const n = Math.round(6 / DT);
          for (let i = 0; i < n; i++) {
            tick(b, fwd(run_));
            peak = Math.max(peak, feetY(b.motor));
          }
          expect(peak).toBeLessThan(0.3);
          expect(b.motor.state.position.z).toBeLessThan(2.4); // it stayed at the foot of the ramp
        }
      });
    }
  }

  it("stays grounded while descending a ramp (snap to ground)", () => {
    const r30 = getBlock(TEST_ARENA, "ramp-30");
    const r = rig({ x: r30.center.x, y: 2.6, z: 6 });
    run(r, 1, IDLE);
    expect(r.motor.state.grounded).toBe(true);
    let airborneSteps = 0;
    const down: MotorIntent = { moveWorld: { x: 0, z: -1 }, run: true, jump: false };
    const n = Math.round(1.2 / DT);
    for (let i = 0; i < n; i++) {
      tick(r, down);
      if (!r.motor.state.grounded) airborneSteps++;
    }
    expect(r.motor.state.position.z).toBeLessThan(5);
    expect(airborneSteps).toBe(0);
  });

  it("respawns at the spawn point when falling below the kill plane", () => {
    const r = rig({ x: 10, y: 0.5, z: 10 }); // above the pit
    let respawned = false;
    for (let i = 0; i < 240 && !respawned; i++) {
      tick(r, IDLE);
      respawned = r.motor.state.respawnedThisStep;
    }
    expect(respawned).toBe(true);
    expect(r.motor.state.position.x).toBeCloseTo(TEST_ARENA.spawn.x, 5);
    expect(r.motor.state.position.z).toBeCloseTo(TEST_ARENA.spawn.z, 5);
    run(r, 1, IDLE);
    expect(r.motor.state.grounded).toBe(true);
  });

  it("moves diagonally at the same speed as forward", () => {
    const f = rig({ x: -6, y: 0, z: -14 });
    settle(f);
    run(f, 1, fwd(true));
    const forwardSpeed = f.motor.state.horizontalSpeed;

    const d = rig({ x: -6, y: 0, z: -14 });
    settle(d);
    const diag = cameraRelativeMove(normalizeMove(1, 1), 0);
    run(d, 1, { moveWorld: diag, run: true, jump: false });
    expect(forwardSpeed).toBeCloseTo(MOTOR_CONFIG.runSpeed, 1);
    expect(d.motor.state.horizontalSpeed).toBeCloseTo(forwardSpeed, 1);
  });

  it("interpolates between the last two captured positions", () => {
    const r = rig({ x: 0, y: 0, z: -12 });
    settle(r);
    run(r, 0.3, fwd(true));
    const out = { x: 0, y: 0, z: 0 };
    const a0 = r.motor.interpolated(0, out).z;
    const a1 = r.motor.interpolated(1, out).z;
    const half = r.motor.interpolated(0.5, out).z;
    expect(a1).toBeGreaterThan(a0);
    expect(half).toBeCloseTo((a0 + a1) / 2, 6);
    expect(a1).toBeCloseTo(r.motor.state.position.z, 6);
  });
});

describe("Rapier lifecycle (assumption A4)", () => {
  it("world.free() releases a character controller", () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const kcc = world.createCharacterController(0.01);
    expect(world.characterControllers.size).toBe(1);
    world.free();
    expect(() => kcc.computedGrounded()).toThrow();
  });

  it("motor.dispose() removes its controller and survives 20 create/free cycles", () => {
    for (let i = 0; i < 20; i++) {
      const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      world.timestep = DT;
      const removeColliders = buildColliders(RAPIER, world, TEST_ARENA);
      const motor = createPlayerMotor(RAPIER, world, center(TEST_ARENA.spawn), MOTOR_CONFIG);
      for (let s = 0; s < 5; s++) {
        motor.step(DT, fwd());
        world.step();
        motor.capture();
      }
      expect(world.characterControllers.size).toBe(1);
      motor.dispose();
      motor.dispose(); // idempotent
      expect(world.characterControllers.size).toBe(0);
      removeColliders();
      expect(world.bodies.len()).toBe(0);
      expect(world.colliders.len()).toBe(0);
      world.free();
    }
  });
});
