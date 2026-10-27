// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fibonacciCore, mulberry32, textShape } from "./shapes";
import { bodyShape, decodeFrames, projectFrame } from "./avatarCloud";

afterEach(() => vi.restoreAllMocks());

function bounds(pts: Float32Array) {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, sumX: 0 };
  for (let i = 0; i < pts.length; i += 3) {
    b.minX = Math.min(b.minX, pts[i]);
    b.maxX = Math.max(b.maxX, pts[i]);
    b.minY = Math.min(b.minY, pts[i + 1]);
    b.maxY = Math.max(b.maxY, pts[i + 1]);
    b.sumX += pts[i];
  }
  return b;
}

describe("shapes", () => {
  it("builds the core one unit tall and centred", () => {
    const s = fibonacciCore(600);
    const b = bounds(s.pts);
    expect(s.pts.length).toBe(1800);
    expect(b.maxY - b.minY).toBeCloseTo(1, 1);
    expect(Math.abs(b.sumX / 600)).toBeLessThan(0.05);
    expect(s.family).toBe("core");
  });

  it("samples a word from the canvas ink, normalised to the ink's height", () => {
    // A fake 2D context whose "glyphs" are one 100 x 100 square.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      const canvas = this;
      return {
        font: "",
        fillStyle: "",
        textBaseline: "",
        measureText: () => ({ width: 200 }),
        fillText: () => {},
        getImageData: () => {
          const w = canvas.width;
          const h = canvas.height;
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 60; y < 160; y++) for (let x = 12; x < 112; x++) data[(y * w + x) * 4 + 3] = 255;
          return { data, width: w, height: h };
        },
      } as unknown as CanvasRenderingContext2D;
    });
    const s = textShape(500, "Ab", "Test", "word:t", mulberry32(1));
    expect(s).not.toBeNull();
    expect(s!.aspect).toBeCloseTo(1);
    expect(s!.family).toBe("word");
    const b = bounds(s!.pts);
    expect(b.minX).toBeGreaterThanOrEqual(-0.5);
    expect(b.maxX).toBeLessThanOrEqual(0.5);
    expect(b.minY).toBeGreaterThanOrEqual(-0.5);
    expect(b.maxY).toBeLessThanOrEqual(0.5);
    expect(b.maxX - b.minX).toBeGreaterThan(0.9);
  });

  it("gives up without a 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(textShape(10, "x", "Test", "word:x")).toBeNull();
  });
});

describe("avatar cloud", () => {
  it("decodes bytes back into the bounding box, one array per pose", () => {
    const meta = { url: "", n: 2, frames: ["idle", "a"] as const, min: [0, 1, 2] as const, size: [10, 10, 10] as const };
    const bytes = new Uint8Array([0, 255, 128, 255, 0, 0, 51, 51, 51, 0, 0, 0]);
    const f = decodeFrames(bytes, meta);
    [0, 11, 2 + (10 * 128) / 255, 10, 1, 2].forEach((v, i) => expect(f.idle[i]).toBeCloseTo(v, 5));
    expect(f.a[0]).toBeCloseTo(2);
    expect(() => decodeFrames(bytes.subarray(0, 5), meta)).toThrow();
  });

  it("projects the hero pose onto the frame: head up, hand to the right, inside the frame", () => {
    const cam = { position: [0, -0.3, 4.9] as const, target: [0, -0.7, 0] as const, fov: 32, feetY: -1.5 };
    const frame = new Float32Array([0, 0, 0, 0, 1.7, 0, 0.3, 1, 0]);
    const p = projectFrame(frame, 16 / 9, cam);
    expect(p[1]).toBeGreaterThan(0); // feet below the centre (y down)
    expect(p[4]).toBeLessThan(0); // head above it
    expect(p[4]).toBeGreaterThan(-0.5); // and inside the frame
    expect(Math.abs(p[0])).toBeLessThan(0.02);
    expect(p[6]).toBeGreaterThan(0.05); // the hand on the right
    expect(Math.abs(p[2])).toBeLessThan(0.3);
  });

  it("re-centres a projected pose so the body is one unit tall", () => {
    const projected = new Float32Array([0, 0, 0, 0, 1, 0, 0.5, 0.5, 0.2]);
    const s = bodyShape(projected, 3, "wave:a");
    expect(s.aspect).toBeCloseTo(0.5);
    expect(s.pts[1]).toBeCloseTo(-0.5);
    expect(s.pts[4]).toBeCloseTo(0.5);
    expect(s.pts[6]).toBeCloseTo(0.25);
    expect(s.family).toBe("avatar");
  });
});
