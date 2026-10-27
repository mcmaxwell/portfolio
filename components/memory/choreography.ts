/**
 * What the memory layer should be at this scroll position: which shape, how strongly, where on the
 * screen. Pure, so the story is testable without a browser. Rects are viewport coordinates, as
 * getBoundingClientRect gives them.
 */
export type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

export type AnchorKind = "statement" | "word" | "wave";
export type Anchor = { kind: AnchorKind; id: string; rect: Rect };

export type Scene = {
  vw: number;
  vh: number;
  scrollY: number;
  /** Seconds. */
  t: number;
  /** The hero canvas, where the real avatar is drawn. */
  hero: Rect | null;
  anchors: readonly Anchor[];
};

export type Want = {
  id: string;
  cx: number;
  cy: number;
  /** The box the shape is fitted into, keeping its aspect. */
  fitW: number;
  fitH: number;
  alpha: number;
  /** Turn about the vertical axis, radians. */
  rot: number;
  /** 0..1, how much the layer wants this shape right now; the strongest want wins. */
  weight: number;
};

export type Cue = {
  want: Want | null;
  /** 0 = formed into the shape, 1 = loose dust across the viewport. */
  scatter: number;
  /** Opacity of the whole layer: nothing over the hero at rest. */
  layer: number;
  /** How far the real avatar has dissolved (drives the hero canvas opacity). */
  dissolve: number;
};

export const smooth = (x: number, a: number, b: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const overlap = (r: Rect, top: number, bottom: number) => Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top));

/** One wave: stand, raise the hand through three poses, back down, rest; then again. Seconds. */
export const WAVE_CYCLE = 5.2;
const WAVE_STEPS: readonly [number, string][] = [
  [0, "wave:idle"],
  [1.6, "wave:a"],
  [1.9, "wave:b"],
  [2.2, "wave:c"],
  [2.5, "wave:b"],
  [2.8, "wave:a"],
  [3.1, "wave:idle"],
];
export function waveFrame(elapsed: number): string {
  const p = elapsed % WAVE_CYCLE;
  let id = WAVE_STEPS[0][1];
  for (const [at, frame] of WAVE_STEPS) if (p >= at) id = frame;
  return id;
}

/** How long a project's name stays over its screenshot once the card has settled, and how long it
 *  takes to let go, seconds. */
export const WORD_HOLD = 2.6;
export const WORD_RELEASE = 1.2;

export class Choreographer {
  private settledAt = new Map<string, number>();
  private waveSince = -1;

  cue(s: Scene): Cue {
    const { vw, vh, t } = s;
    const sv = s.scrollY / vh;
    const wants: Want[] = [];

    // Leaving the hero: the particles light up on the avatar's surface, then take it apart. They
    // are already formed on it at rest (the layer is invisible there), so the first scroll shows
    // them on the body rather than flying in.
    const dissolve = smooth(sv, 0.3, 0.8);
    if (s.hero && s.hero.height > 0) {
      const weight = 1 - smooth(sv, 1.0, 1.4);
      if (weight > 0) {
        wants.push({
          id: "hero",
          cx: s.hero.left + s.hero.width / 2,
          cy: s.hero.top + s.hero.height / 2,
          fitW: Infinity,
          fitH: s.hero.height,
          alpha: 0.9,
          rot: 0,
          weight,
        });
      }
    }

    // Cards stack on wide screens: an earlier card stays on screen under the next one, so only the
    // last card that has arrived may spell its name.
    const arrival = (r: Rect) => smooth(0.92 * vh - r.top, 0, 0.45 * vh);
    let frontWord: Anchor | null = null;
    for (const a of s.anchors) if (a.kind === "word" && a.rect.height > 0 && arrival(a.rect) > 0.3) frontWord = a;

    for (const a of s.anchors) {
      const r = a.rect;
      if (!(r.height > 0)) continue;
      if (a.kind === "word" && frontWord && a !== frontWord) {
        this.settledAt.delete(a.id);
        continue;
      }
      if (a.kind === "statement") {
        // The memory core sits beside the About statement while it is in the middle of the screen,
        // or faintly behind it when there is no room at the side.
        const vis = overlap(r, 0.1 * vh, 0.95 * vh) / r.height;
        const weight = smooth(vis, 0.15, 0.6);
        if (weight <= 0) continue;
        const room = vw - r.right;
        const cy = r.top + r.height / 2;
        const rot = t * 0.35;
        if (room > 320) {
          wants.push({ id: "core", cx: r.right + room / 2, cy, fitW: room - 80, fitH: Math.min(r.height * 1.2, vh * 0.6), alpha: 0.9, rot, weight });
        } else {
          wants.push({ id: "core", cx: Math.min(vw / 2, r.left + r.width * 0.62), cy, fitW: vw * 0.7, fitH: vh * 0.45, alpha: 0.22, rot, weight });
        }
      } else if (a.kind === "word") {
        // A project's name forms over its screenshot as the card arrives, holds a moment once the
        // card has settled, then lets go so the screenshot shows.
        const arrive = arrival(r);
        const leave = smooth(r.bottom, 0.25 * vh, 0.55 * vh);
        let weight = arrive * leave;
        if (arrive >= 0.98) {
          if (!this.settledAt.has(a.id)) this.settledAt.set(a.id, t);
          weight *= 1 - smooth(t - this.settledAt.get(a.id)!, WORD_HOLD, WORD_HOLD + WORD_RELEASE);
        } else if (arrive < 0.5) {
          this.settledAt.delete(a.id);
        }
        if (weight <= 0) continue;
        wants.push({
          id: `word:${a.id}`,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          fitW: r.width * 0.82,
          fitH: r.height * 0.42,
          alpha: 0.95,
          rot: 0,
          weight,
        });
      } else {
        // Contact: the dust gathers back into the avatar, which waves.
        const vis = overlap(r, 0, vh) / r.height;
        const weight = smooth(vis, 0.25, 0.8);
        if (weight <= 0) {
          this.waveSince = -1;
          continue;
        }
        if (this.waveSince < 0) this.waveSince = t;
        wants.push({
          id: waveFrame(t - this.waveSince),
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          fitW: r.width,
          fitH: r.height,
          alpha: 0.9,
          rot: 0,
          weight,
        });
      }
    }

    let want: Want | null = null;
    for (const w of wants) if (!want || w.weight > want.weight) want = w;
    if (want && want.weight < 0.02) want = null;

    let scatter = 1;
    if (want) {
      scatter = want.id === "hero" ? smooth(sv, 0.5, 1.0) : 1 - smooth(want.weight, 0, 0.8);
    }
    return { want, scatter, layer: smooth(sv, 0.02, 0.1), dissolve };
  }
}
