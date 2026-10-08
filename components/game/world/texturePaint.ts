// The painters of the procedural world textures (visual pass): drawn once on canvases at first use,
// so the game ships zero texture bytes. Every material texture tiles seamlessly (periodic value
// noise, wrapped strokes) because world materials sample them in world space (see world/materials.ts).
// No three.js import and no DOM access beyond a canvas, so the same code runs on the main thread
// (HTMLCanvasElement) and in the texture worker (OffscreenCanvas); see textures.ts.

export type TexName =
  | "grass"
  | "paving"
  | "gravel"
  | "plaster"
  | "ashlar"
  | "standing"
  | "steel"
  | "planks"
  | "leaves"
  | "bark"
  | "floor"
  | "cliff";

export type RGB = readonly [number, number, number];

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lattice(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise in [0, 1): u and v in [0, 1) tile with period 1 at every frequency. */
function noise(u: number, v: number, fx: number, fy: number, seed: number): number {
  const x = u * fx;
  const y = v * fy;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const xa = ((x0 % fx) + fx) % fx;
  const xb = (xa + 1) % fx;
  const ya = ((y0 % fy) + fy) % fy;
  const yb = (ya + 1) % fy;
  const a = lattice(xa, ya, seed);
  const b = lattice(xb, ya, seed);
  const c = lattice(xa, yb, seed);
  const d = lattice(xb, yb, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, f: number, oct: number, seed: number, fy = f): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = f;
  let fyy = fy;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(u, v, fx, fyy, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fyy *= 2;
  }
  return sum / norm;
}

export const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

/** Canvas of size S: per-pixel colour from `px(u, v)` first, then a stroke pass `over`. */
/** Awaited between slices of work; resolves at once until the caller wants the main thread back. */
export type Pause = () => Promise<void>;

export type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(S: number): Canvas2D {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    return c;
  }
  return new OffscreenCanvas(S, S);
}

async function paint(pause: Pause, S: number, px: (u: number, v: number) => RGB, over?: (g: Ctx2D, S: number) => Promise<void>): Promise<Canvas2D> {
  const canvas = makeCanvas(S);
  const g = canvas.getContext("2d") as Ctx2D;
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = px(x / S, y / S);
      const i = (y * S + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
    if (y % 8 === 7) await pause();
  }
  g.putImageData(img, 0, 0);
  if (over) await over(g, S);
  return canvas;
}

/** Run `fn` at the nine wrapped offsets, so a stroke crossing an edge continues on the far side. */
function wrapped(g: Ctx2D, S: number, fn: () => void) {
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      g.save();
      g.translate(dx, dy);
      fn();
      g.restore();
    }
  }
}

const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export const PAINTERS: Record<TexName, (pause: Pause) => Promise<Canvas2D>> = {
  async grass(pause) {
    const dark = hex("#10241a");
    const lush = hex("#2c5230");
    const dry = hex("#4a5630");
    const r = rng(11);
    return paint(pause,
      512,
      (u, v) => {
        const n = fbm(u, v, 4, 4, 3);
        const patch = fbm(u, v, 3, 3, 9);
        let c = mix(dark, lush, n);
        c = mix(c, dry, Math.max(0, patch - 0.55) * 1.3);
        return shade(c, 0.85 + 0.3 * noise(u, v, 64, 64, 5));
      },
      async (g, S) => {
        g.lineCap = "round";
        for (let i = 0; i < 5200; i++) {
          if (i % 300 === 0) await pause();
          const x = r() * S;
          const y = r() * S;
          const len = 5 + r() * 9;
          const a = -Math.PI / 2 + (r() - 0.5) * 1.1;
          const c = mix(dark, r() < 0.7 ? lush : dry, 0.4 + r() * 0.8);
          g.strokeStyle = css(shade(c, 0.8 + r() * 0.6), 0.55);
          g.lineWidth = 1 + r();
          wrapped(g, S, () => {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
            g.stroke();
          });
        }
      }
    );
  },
  async paving(pause) {
    const base = hex("#5d6c68");
    const grout = hex("#141c1a");
    const N = 4;
    return paint(pause,
      512,
      (u, v) => {
        const cu = (u * N) % 1;
        const cv = (v * N) % 1;
        const id = Math.floor(u * N) + Math.floor(v * N) * N;
        const tile = shade(base, 0.92 + 0.16 * lattice(id, 7, 3));
        const edge = Math.min(cu, 1 - cu, cv, 1 - cv);
        const wear = fbm(u, v, 8, 4, 21);
        let c = shade(tile, 0.86 + 0.28 * wear);
        c = shade(c, 0.94 + 0.12 * noise(u, v, 128, 128, 2));
        if (edge < 0.012) return mix(grout, c, edge / 0.012 * 0.15);
        if (edge < 0.03) c = shade(c, 1.12);
        if (cu < 0.03 || cv < 0.03) c = shade(c, 0.9);
        return c;
      }
    );
  },
  async gravel(pause) {
    const r = rng(23);
    const base = hex("#5b5f55");
    return paint(pause,
      512,
      (u, v) => shade(mix(hex("#3f443d"), base, fbm(u, v, 6, 4, 8)), 0.85 + 0.3 * noise(u, v, 96, 96, 4)),
      async (g, S) => {
        for (let i = 0; i < 1400; i++) {
          if (i % 100 === 0) await pause();
          const x = r() * S;
          const y = r() * S;
          const rx = 3 + r() * 6;
          const ry = rx * (0.6 + r() * 0.4);
          const t = r();
          const c: RGB = t < 0.4 ? [84, 86, 80] : t < 0.75 ? [72, 69, 62] : [100, 96, 86];
          wrapped(g, S, () => {
            g.fillStyle = "rgba(20,24,20,0.3)";
            g.beginPath();
            g.ellipse(x + 1.2, y + 1.6, rx, ry, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = css(shade(c, 0.8 + r() * 0.4), 0.9);
            g.beginPath();
            g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
            g.fill();
          });
        }
      }
    );
  },
  async plaster(pause) {
    const base = hex("#8fa09c");
    return paint(pause,
      512,
      (u, v) => {
        let c = shade(base, 0.9 + 0.2 * fbm(u, v, 5, 4, 31));
        c = shade(c, 0.95 + 0.1 * noise(u, v, 160, 160, 6));
        // vertical weathering streaks
        c = shade(c, 0.9 + 0.12 * noise(u, v, 40, 3, 12));
        const gu = Math.abs(((u * 2 + 0.5) % 1) - 0.5);
        const gv = Math.abs(((v * 2 + 0.5) % 1) - 0.5);
        const groove = Math.min(gu, gv);
        if (groove > 0.488) return shade(c, 0.45);
        if (groove > 0.478) return shade(c, 1.08);
        return c;
      }
    );
  },
  async ashlar(pause) {
    const rows = 6;
    const base = hex("#767f79");
    return paint(pause, 512, (u, v) => {
      const row = Math.floor(v * rows);
      const off = row % 2 === 0 ? 0 : 1 / 6;
      const uu = (u + off) % 1;
      const col = Math.floor(uu * 3);
      const cu = (uu * 3) % 1;
      const cv = (v * rows) % 1;
      const k = 0.78 + 0.4 * lattice(col + row * 7, row, 5);
      let c = shade(base, k * (0.9 + 0.2 * fbm(u, v, 12, 3, 41)));
      c = shade(c, 0.94 + 0.12 * noise(u, v, 128, 128, 7));
      const e = Math.min(cu * 3 / 3, 1 - cu, cv, 1 - cv);
      if (e < 0.018) return shade(c, 0.4);
      if (cv > 0.9) return shade(c, 0.86);
      if (cv < 0.07) return shade(c, 1.14);
      return c;
    });
  },
  async standing(pause) {
    const base = hex("#3b5558");
    return paint(pause, 256, (u, v) => {
      const s = (u * 4) % 1;
      let c = shade(base, 0.88 + 0.2 * noise(u, v, 4, 16, 5));
      c = shade(c, 0.95 + 0.1 * noise(u, v, 96, 4, 9));
      if (s < 0.04) return shade(c, 1.45);
      if (s > 0.96) return shade(c, 0.55);
      return shade(c, 1 - 0.1 * s);
    });
  },
  async steel(pause) {
    const base = hex("#566a72");
    return paint(pause,
      256,
      (u, v) => {
        let c = shade(base, 0.9 + 0.2 * noise(u, v, 4, 64, 17));
        c = shade(c, 0.95 + 0.1 * noise(u, v, 32, 32, 3));
        const gu = Math.abs(((u * 2 + 0.5) % 1) - 0.5);
        const gv = Math.abs(((v * 2 + 0.5) % 1) - 0.5);
        const e = Math.min(gu, gv);
        if (e > 0.49) return shade(c, 0.4);
        if (e > 0.478) return shade(c, 1.25);
        return c;
      },
      async (g, S) => {
        g.fillStyle = "rgba(20,28,32,0.7)";
        for (const x of [0.07, 0.43, 0.57, 0.93]) {
          for (const y of [0.07, 0.43, 0.57, 0.93]) {
            g.beginPath();
            g.arc(x * S, y * S, 2, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    );
  },
  async planks(pause) {
    const base = hex("#6c4e33");
    const n = 6;
    return paint(pause,
      512,
      (u, v) => {
        const row = Math.floor(v * n);
        const cv = (v * n) % 1;
        const k = 0.78 + 0.4 * lattice(row, 3, 9);
        let c = shade(base, k * (0.85 + 0.3 * noise(u + lattice(row, 1, 2), v, 3, 48, 14)));
        c = shade(c, 0.9 + 0.2 * noise(u, v, 2, 160, 6));
        if (cv < 0.04 || cv > 0.96) return shade(c, 0.35);
        return c;
      }
    );
  },
  async leaves(pause) {
    const r = rng(37);
    const dark = hex("#173a22");
    const lit = hex("#4f9a4c");
    return paint(pause,
      512,
      (u, v) => shade(mix(dark, lit, fbm(u, v, 6, 4, 19)), 0.85 + 0.3 * noise(u, v, 64, 64, 4)),
      async (g, S) => {
        for (let i = 0; i < 3400; i++) {
          if (i % 250 === 0) await pause();
          const x = r() * S;
          const y = r() * S;
          const a = r() * Math.PI;
          const l = 5 + r() * 7;
          const t = r();
          const c = mix(dark, lit, t * t * 1.2);
          const bright = r() < 0.08 ? hex("#79a84a") : c;
          wrapped(g, S, () => {
            g.fillStyle = css(shade(bright, 0.8 + r() * 0.5), 0.9);
            g.beginPath();
            g.ellipse(x, y, l, l * 0.42, a, 0, Math.PI * 2);
            g.fill();
          });
        }
      }
    );
  },
  async bark(pause) {
    return paint(pause, 256, (u, v) => {
      const n = fbm(u, v, 20, 3, 5, 3);
      let c = mix(hex("#2d221a"), hex("#5d4a3a"), n);
      c = shade(c, 0.85 + 0.3 * noise(u, v, 64, 64, 2));
      if (noise(u, v, 20, 3, 5) < 0.2) c = shade(c, 0.6);
      return c;
    });
  },
  async floor(pause) {
    const N = 4;
    return paint(pause, 512, (u, v) => {
      const cu = (u * N) % 1;
      const cv = (v * N) % 1;
      const id = Math.floor(u * N) + Math.floor(v * N) * N;
      let c = shade(hex("#3b4c4a"), 0.9 + 0.2 * lattice(id, 5, 8));
      c = shade(c, 0.9 + 0.2 * fbm(u, v, 6, 3, 25));
      const e = Math.min(cu, 1 - cu, cv, 1 - cv);
      if (e < 0.012) return hex("#0e1514");
      if (e < 0.022) return shade(c, 1.3);
      return c;
    });
  },
  async cliff(pause) {
    const r = rng(53);
    return paint(pause,
      512,
      (u, v) => shade(mix(hex("#2a2620"), hex("#5a5448"), fbm(u, v, 3, 5, 61, 6)), 0.9 + 0.2 * noise(u, v, 80, 80, 3)),
      async (g, S) => {
        g.strokeStyle = "rgba(10,10,8,0.5)";
        g.lineWidth = 2;
        for (let i = 0; i < 40; i++) {
          const y = r() * S;
          const x = r() * S;
          wrapped(g, S, () => {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + 30 + r() * 70, y + (r() - 0.5) * 8);
            g.stroke();
          });
        }
      }
    );
  },
};

