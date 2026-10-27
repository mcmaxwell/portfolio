// The hand-off transform must land the film's last-frame avatar exactly on the live avatar, for the
// wide cut on landscape screens and the 9:16 cut on phones (object-cover crops differently in each).
import { describe, expect, it } from "vitest";
import { FILM_AVATAR, LIVE_AVATAR, matchTransform } from "./IntroVideo";

function landed(w: number, h: number, vw: number, vh: number) {
  const t = matchTransform({ width: w, height: h } as DOMRect, { videoWidth: vw, videoHeight: vh } as HTMLVideoElement);
  const [, y, s] = /translate3d\(0, (-?[\d.]+)px, 0\) scale\(([\d.]+)\)/.exec(t!)!.map(Number);
  const shown = Math.max(h, w / (vw / vh));
  const off = (h - shown) / 2;
  // Apply the transform (origin at the box centre) to the film avatar's top and bottom.
  const at = (f: number) => h / 2 + s * (off + f * shown - h / 2) + y;
  return { top: at(FILM_AVATAR.top) / h, bottom: at(FILM_AVATAR.bottom) / h };
}

describe("intro hand-off", () => {
  for (const [w, h, vw, vh] of [
    [1920, 1080, 1280, 720],
    [1440, 900, 1280, 720],
    [2560, 1080, 1280, 720],
    [390, 844, 540, 960],
    [1024, 1366, 1280, 720],
  ]) {
    it(`lands on the live avatar at ${w}x${h}`, () => {
      const r = landed(w, h, vw, vh);
      expect(r.top).toBeCloseTo(LIVE_AVATAR.top, 3);
      expect(r.bottom).toBeCloseTo(LIVE_AVATAR.bottom, 3);
    });
  }

  it("gives up (plain dissolve) before the video has dimensions", () => {
    expect(matchTransform({ width: 100, height: 100 } as DOMRect, { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement)).toBeNull();
  });
});
