/**
 * Point clouds the memory layer morphs between. Local units: the shape is centred on (0, 0) and
 * one unit tall, y pointing down as on screen; z is depth in the same unit (for parallax and the
 * core's slow turn). `aspect` is width over height, so a shape can be fitted into a box.
 */
export type Shape = { id: string; family: string; pts: Float32Array; aspect: number };

/** A small seeded PRNG, so a shape is the same on every visit. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => Array.from(s).reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** Scales a cloud in place so its height is one unit, centred vertically. */
function normalizeHeight(pts: Float32Array) {
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pts.length; i += 3) {
    minY = Math.min(minY, pts[i]);
    maxY = Math.max(maxY, pts[i]);
  }
  const h = maxY - minY || 1;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < pts.length; i += 3) {
    pts[i] /= h;
    pts[i + 1] = (pts[i + 1] - cy) / h;
    pts[i + 2] /= h;
  }
}

/**
 * The memory core: a globe of points with three orbits around it, the "company memory" at the heart
 * of the products. Deterministic, so it looks the same on every visit.
 */
export function fibonacciCore(n: number, id = "core"): Shape {
  const pts = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const onSphere = Math.floor(n * 0.62);
  const R = 0.4;
  for (let i = 0; i < onSphere; i++) {
    const y = 1 - (i / Math.max(1, onSphere - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    pts[i * 3] = Math.cos(th) * r * R;
    pts[i * 3 + 1] = y * R;
    pts[i * 3 + 2] = Math.sin(th) * r * R;
  }
  // Orbits: tilt about x, then spin about y, radius just outside the globe.
  const rings: [number, number][] = [
    [0.35, 0],
    [-0.55, 1.1],
    [1.2, 2.2],
  ];
  const perRing = Math.ceil((n - onSphere) / rings.length);
  for (let i = onSphere; i < n; i++) {
    const k = i - onSphere;
    const [tilt, spin] = rings[Math.min(rings.length - 1, Math.floor(k / perRing))];
    const a = ((k % perRing) / perRing) * Math.PI * 2;
    const x = Math.cos(a) * 0.5;
    const z = Math.sin(a) * 0.5;
    const y2 = -z * Math.sin(tilt);
    const z2 = z * Math.cos(tilt);
    pts[i * 3] = x * Math.cos(spin) + z2 * Math.sin(spin);
    pts[i * 3 + 1] = y2;
    pts[i * 3 + 2] = -x * Math.sin(spin) + z2 * Math.cos(spin);
  }
  normalizeHeight(pts);
  return { id, family: "core", pts, aspect: 1 };
}

/**
 * A word as a point cloud, sampled from the glyphs drawn on an offscreen canvas in the site's
 * display face. Returns null where there is no 2D canvas (tests, very old browsers).
 */
export function textShape(n: number, text: string, fontFamily: string, id: string, rnd: () => number = mulberry32(hash(text))): Shape | null {
  if (typeof document === "undefined") return null;
  const size = 160;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const font = `500 ${size}px ${fontFamily}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  const h = Math.ceil(size * 1.4);
  canvas.width = w;
  canvas.height = h;
  // Setting the size resets the context.
  ctx.font = font;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "-0.03em";
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, 12, size * 1.05);
  const data = ctx.getImageData(0, 0, w, h).data;
  const ink: number[] = [];
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 128) continue;
      ink.push(x, y);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const count = ink.length / 2;
  if (!count) return null;
  const height = maxY - minY + 1;
  const cx = (minX + maxX + 1) / 2;
  const cy = (minY + maxY + 1) / 2;
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = Math.min(count - 1, Math.floor(rnd() * count));
    pts[i * 3] = (ink[k * 2] + rnd() - cx) / height;
    pts[i * 3 + 1] = (ink[k * 2 + 1] + rnd() - cy) / height;
    pts[i * 3 + 2] = (rnd() - 0.5) * 0.06;
  }
  return { id, family: "word", pts, aspect: (maxX - minX + 1) / height };
}
