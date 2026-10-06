// Fixed-step accumulator with a capped catch-up (ADR-001, design 4.2).

export interface FixedStepper {
  advance(
    frameDelta: number,
    step: (dt: number) => void
  ): { steps: number; alpha: number; dropped: boolean };
  reset(): void;
}

export function createFixedStepper(cfg: {
  dt: number;
  maxSteps: number;
  maxFrameDelta: number;
}): FixedStepper {
  let acc = 0;
  const EPS = 1e-9;
  return {
    advance(frameDelta, step) {
      const delta = Number.isFinite(frameDelta)
        ? Math.min(Math.max(frameDelta, 0), cfg.maxFrameDelta)
        : 0;
      acc += delta;
      let steps = 0;
      while (acc >= cfg.dt - EPS && steps < cfg.maxSteps) {
        step(cfg.dt);
        acc -= cfg.dt;
        steps++;
      }
      let dropped = false;
      if (acc >= cfg.dt - EPS) {
        // Cap hit: drop the backlog so a slow device slows down instead of spiralling.
        acc = 0;
        dropped = true;
      }
      if (acc < 0) acc = 0;
      return { steps, alpha: Math.min(acc / cfg.dt, 1), dropped };
    },
    reset() {
      acc = 0;
    },
  };
}
