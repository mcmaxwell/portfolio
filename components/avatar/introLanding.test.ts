// The landing transform must carry the film's last-frame avatar exactly onto the live 3D avatar at
// any hero size: the video is object-cover (scales with the larger ratio), the hero camera scales
// with height only.
import { describe, expect, it } from "vitest";
import { landingTransform } from "./IntroVideo";

const FILM = { headX: 964, top: 28, height: 1025 };
const LIVE = { headDX: 5.5, top: 135, height: 727 };

function parse(t: string) {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(t)!;
  return { x: +m[1], y: +m[2], s: +m[3] };
}

describe("intro landing transform", () => {
  for (const [w, h] of [[1920, 1080], [1440, 900], [2560, 1080], [390, 844], [1024, 1366]]) {
    it(`lands the film avatar on the live avatar at ${w}x${h}`, () => {
      const { x, y, s } = parse(landingTransform(w, h));
      const cover = Math.max(w / 1920, h / 1080);
      // Film source point -> screen (object-cover, centred), then the transform about the centre.
      const screen = (u: number, v: number) => ({
        x: w / 2 + s * cover * (u - 960) + x,
        y: h / 2 + s * cover * (v - 540) + y,
      });
      const k = h / 1080;
      const head = screen(FILM.headX, FILM.top);
      const sole = screen(FILM.headX, FILM.top + FILM.height);
      expect(head.x).toBeCloseTo(w / 2 + k * LIVE.headDX, 0); // within half a pixel
      expect(head.y).toBeCloseTo(k * LIVE.top, 0); // within half a pixel
      expect(sole.y - head.y).toBeCloseTo(k * LIVE.height, 0); // within half a pixel
    });
  }
});
