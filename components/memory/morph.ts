/**
 * Two shape slots and a mix between them: the GPU draws every particle somewhere between slot A
 * and slot B (plus the dust it scatters into), and this class decides what the slots hold. A new
 * target always goes into B and A takes over once the morph completes, so there is never a jump.
 */
export type Place = { cx: number; cy: number; scale: number; alpha: number; rot: number };

export type Target = { id: string; family: string; pts: Float32Array; place: Place };

export type Slot = { id: string | null; family: string; pts: Float32Array; place: Place; dirty: boolean };

const ZERO: Place = { cx: 0, cy: 0, scale: 0, alpha: 0, rot: 0 };

/** Seconds a morph takes between unrelated shapes and between poses of the same figure. */
export const MORPH_SECONDS = { far: 1.1, near: 0.3 } as const;
/** Time constant of the gather / scatter easing, seconds. */
const SCATTER_TAU = 0.35;

const ease = (m: number) => m * m * (3 - 2 * m);

export class Morph {
  readonly a: Slot;
  readonly b: Slot;
  /** 0 = fully slot A, 1 = fully slot B. */
  mix = 0;
  scatter = 1;
  /** How far particles bulge sideways mid-morph (0 between poses of one figure). */
  bulge = 1;
  private duration: number = MORPH_SECONDS.far;

  constructor(readonly n: number) {
    this.a = { id: null, family: "", pts: new Float32Array(n * 3), place: { ...ZERO }, dirty: true };
    this.b = { id: null, family: "", pts: new Float32Array(n * 3), place: { ...ZERO }, dirty: true };
  }

  /** The slot that currently holds the shape being morphed towards (or shown). */
  get head(): Slot {
    return this.b.id !== null ? this.b : this.a;
  }

  update(dt: number, target: Target | null, scatterTarget: number) {
    if (target) {
      if (target.id !== this.head.id) this.retarget(target);
      // The target's place follows the page every frame (scroll, resize), without easing.
      this.head.place = { ...target.place };
    }
    if (this.b.id !== null) {
      this.mix = Math.min(1, this.mix + dt / this.duration);
      if (this.mix >= 1) this.commit();
    }
    this.scatter += (scatterTarget - this.scatter) * (1 - Math.exp(-dt / SCATTER_TAU));
  }

  private retarget(target: Target) {
    if (this.a.id === null) {
      // First shape ever: nothing to morph from, it simply gathers out of the dust.
      this.fill(this.a, target);
      return;
    }
    if (this.b.id !== null) {
      // Interrupted mid-morph: freeze the current blend into A, so the new morph starts from what
      // is on screen.
      const m = ease(this.mix);
      const a = this.a.pts;
      const b = this.b.pts;
      for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * m;
      const pa = this.a.place;
      const pb = this.b.place;
      this.a.place = {
        cx: pa.cx + (pb.cx - pa.cx) * m,
        cy: pa.cy + (pb.cy - pa.cy) * m,
        scale: pa.scale + (pb.scale - pa.scale) * m,
        alpha: pa.alpha + (pb.alpha - pa.alpha) * m,
        rot: pa.rot + (pb.rot - pa.rot) * m,
      };
      this.a.id = `${this.a.id}>${this.b.id}`;
      this.a.dirty = true;
    }
    this.fill(this.b, target);
    this.mix = 0;
    const near = target.family === this.a.family && target.family === "avatar";
    this.bulge = near ? 0 : 1;
    this.duration = near ? MORPH_SECONDS.near : MORPH_SECONDS.far;
  }

  private fill(slot: Slot, target: Target) {
    slot.id = target.id;
    slot.family = target.family;
    slot.pts.set(target.pts.subarray(0, slot.pts.length));
    slot.place = { ...target.place };
    slot.dirty = true;
  }

  private commit() {
    this.a.id = this.b.id;
    this.a.family = this.b.family;
    this.a.pts.set(this.b.pts);
    this.a.place = { ...this.b.place };
    this.a.dirty = true;
    this.b.id = null;
    this.mix = 0;
  }
}
