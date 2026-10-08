// Play and Exit transition constants (play-transition.md sections 1 to 6).
// Constants and tiny pure helpers only: this file is shared by the hero chunk and the game
// chunk, so it must not import React, three or anything outside shell/. Tuning the
// experience means editing this table and nothing else.

/** Easing tokens; identical to the Tailwind ease-in and ease-out plus the motion curve. */
export const EASE = {
  in: "cubic-bezier(0.4, 0, 1, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  inOut: "cubic-bezier(0.45, 0, 0.2, 1)",
} as const;

/** Hero framing: single source for TalkingAvatar and for the game camera hand-over. */
export const HERO = {
  /** World y of the avatar's feet in the hero scene (the avatar group sits at [0, feetY, 0]). */
  feetY: -1.5,
  cameraPosition: [0, -0.3, 4.9] as const,
  cameraTarget: [0, -0.7, 0] as const,
  fov: 32,
  /** Camera offset from the feet and the look-at height, derived from the numbers above. */
  offsetFromFeet: { up: 1.2, back: 4.9 },
  lookHeight: 0.8,
  /** Lights of the hero scene, reproduced by the game at entry so the swap does not change shading. */
  lights: {
    ambient: 1.1,
    hemisphere: 0.7,
    key: { position: [2, 4, 3] as const, intensity: 1.6 },
    fill: { position: [-3, 2, -2] as const, intensity: 0.5 },
  },
  /** Far fog in the hero scene: never visible, but keeps the shader programs equal to the game's. */
  fog: { color: "#050807", near: 1000, far: 2000 },
} as const;

export const TIMING = {
  /** C to S in the warm case: the chrome exit (Beat A). */
  chromeMs: 360,
  /** Longest wait beyond `chromeMs` for the chrome's transitions to finish before the swap goes ahead anyway. */
  chromeMaxExtraMs: 300,
  /** The loading strip appears only if the load has not finished by this time after C. */
  stripDelayMs: 400,
  stripMinVisibleMs: 300,
  stripFadeInMs: 200,
  stripFadeOutMs: 150,
  /** Canvas FLIP (Beat B and its reverse). */
  flipMs: 400,
  /** Beats C to F, relative to S. */
  entry: {
    holdMs: 150,
    turnStartMs: 150,
    turnEndMs: 570,
    walkFadeStartMs: 400,
    walkStartMs: 500,
    doneMs: 1500,
    envMs: 300,
    cameraMs: 1500,
    skipFinishMs: 250,
    /** The skeleton eases from the hero pose into the game idle (the idle phases differ). */
    poseBlendMs: 400,
  },
  hud: {
    buttonsStartMs: 1000,
    buttonsEndMs: 1300,
    hintStartMs: 1500,
    hintEndMs: 1800,
    touchStartMs: 1200,
    touchEndMs: 1500,
    hintHideAfterMs: 6000,
  },
  /** Exit, relative to X. */
  exit: {
    hudFadeMs: 200,
    turnMs: 420,
    cameraMs: 700,
    envStartMs: 100,
    envEndMs: 600,
    swapMs: 700,
    chromeBackMs: 400,
    totalMs: 1100,
    /** Safety net: the shell swaps even if the game never reports the end of the leg. */
    fallbackMs: 2500,
  },
  /** prefers-reduced-motion variant (section 5). */
  reduced: { fadeMs: 150, stripFadeMs: 100 },
} as const;

/** Click to input enabled in the warm case (section 2). */
export const WARM_CLICK_TO_INPUT_MS = TIMING.chromeMs + TIMING.entry.doneMs;

export type ChromeItemId = "title" | "gestures" | "chips" | "hints" | "status";
export type ChromeItem = {
  id: ChromeItemId;
  axis: "x" | "y" | null;
  distance: number; // px, signed, applied while hidden
  outStartMs: number; // relative to C
  outEndMs: number;
  inStartMs: number; // relative to the swap back to the hero
  inEndMs: number;
  staggerMs: number; // per child, in both directions
};

export const CHROME: Record<ChromeItemId, ChromeItem> = {
  title: { id: "title", axis: "y", distance: 32, outStartMs: 60, outEndMs: 360, inStartMs: 0, inEndMs: 300, staggerMs: 0 },
  gestures: { id: "gestures", axis: "x", distance: -24, outStartMs: 0, outEndMs: 300, inStartMs: 60, inEndMs: 360, staggerMs: 20 },
  chips: { id: "chips", axis: "y", distance: 24, outStartMs: 0, outEndMs: 300, inStartMs: 60, inEndMs: 360, staggerMs: 20 },
  hints: { id: "hints", axis: "x", distance: 24, outStartMs: 40, outEndMs: 340, inStartMs: 100, inEndMs: 400, staggerMs: 0 },
  status: { id: "status", axis: null, distance: 0, outStartMs: 0, outEndMs: 120, inStartMs: 120, inEndMs: 300, staggerMs: 0 },
};
/** Side navigation dots are animated by CSS in app/globals.css with these numbers. */
export const NAV = { outMs: 300, inMs: 300, distance: 24 } as const;

/** The CSS transition shorthand for one chrome child while hidden (leaving) or shown (arriving). */
export function chromeTransition(item: ChromeItem, hidden: boolean, childIndex: number, reduced: boolean): string {
  if (reduced) return `opacity ${TIMING.reduced.fadeMs}ms ${EASE.out}`;
  const stagger = childIndex * item.staggerMs;
  const [start, end] = hidden ? [item.outStartMs, item.outEndMs] : [item.inStartMs, item.inEndMs];
  const ease = hidden ? EASE.in : EASE.out;
  // The stagger delays the start; the end stays at the item's end, so the whole list is gone by C+360
  // (the chrome is removed then) and back by X+1100 however many children it has.
  const dur = Math.max(60, end - start - stagger);
  const delay = start + stagger;
  const props = item.axis ? ["opacity", "translate"] : ["opacity"];
  return props.map((p) => `${p} ${dur}ms ${ease} ${delay}ms`).join(", ");
}

/** The hidden-state translate value (CSS `translate` property composes with Tailwind transforms). */
export function chromeTranslate(item: ChromeItem, hidden: boolean, reduced: boolean): string | undefined {
  if (!item.axis) return undefined;
  if (!hidden || reduced) return "none";
  return item.axis === "x" ? `${item.distance}px 0px` : `0px ${item.distance}px`;
}

export type Beat = {
  id: string;
  owner: string;
  /** "C" = click, "S" = swap, "X" = exit click. */
  clock: "C" | "S" | "X";
  startMs: number;
  endMs: number;
};

/** The Play timeline as data (sections 2.1 to 2.6), used by the beat-order test. */
export const PLAY_BEATS: readonly Beat[] = [
  { id: "A.chrome-exit", owner: "TalkingAvatar", clock: "C", startMs: 0, endMs: TIMING.chromeMs },
  { id: "B.canvas-flip", owner: "TalkingAvatar", clock: "C", startMs: 0, endMs: TIMING.flipMs },
  { id: "C.world-reveal", owner: "WorldView", clock: "S", startMs: 0, endMs: TIMING.entry.envMs },
  { id: "D.camera", owner: "followCamera", clock: "S", startMs: 0, endMs: TIMING.entry.cameraMs },
  { id: "E1.avatar-turn", owner: "GameScene", clock: "S", startMs: TIMING.entry.turnStartMs, endMs: TIMING.entry.turnEndMs },
  { id: "E2.walk-fade", owner: "animator", clock: "S", startMs: TIMING.entry.walkFadeStartMs, endMs: TIMING.entry.walkFadeStartMs + 250 },
  { id: "E3.walk", owner: "GameScene", clock: "S", startMs: TIMING.entry.walkStartMs, endMs: TIMING.entry.doneMs },
  { id: "F1.hud-buttons", owner: "GameInterface", clock: "S", startMs: TIMING.hud.buttonsStartMs, endMs: TIMING.hud.buttonsEndMs },
  { id: "F2.hud-touch", owner: "TouchControls", clock: "S", startMs: TIMING.hud.touchStartMs, endMs: TIMING.hud.touchEndMs },
  { id: "F3.hud-hint", owner: "GameInterface", clock: "S", startMs: TIMING.hud.hintStartMs, endMs: TIMING.hud.hintEndMs },
] as const;

/** The Exit timeline as data (sections 4.1 to 4.3). */
export const EXIT_BEATS: readonly Beat[] = [
  { id: "X1.hud-out", owner: "GameInterface", clock: "X", startMs: 0, endMs: TIMING.exit.hudFadeMs },
  { id: "X1.avatar-turn", owner: "GameScene", clock: "X", startMs: 0, endMs: TIMING.exit.turnMs },
  { id: "X1.camera", owner: "followCamera", clock: "X", startMs: 0, endMs: TIMING.exit.cameraMs },
  { id: "X1.world-close", owner: "WorldView", clock: "X", startMs: TIMING.exit.envStartMs, endMs: TIMING.exit.envEndMs },
  { id: "X2.swap", owner: "shell", clock: "X", startMs: TIMING.exit.swapMs, endMs: TIMING.exit.swapMs },
  { id: "X2.canvas-flip", owner: "TalkingAvatar", clock: "X", startMs: TIMING.exit.swapMs, endMs: TIMING.exit.swapMs + TIMING.flipMs },
  { id: "X3.chrome-in", owner: "TalkingAvatar", clock: "X", startMs: TIMING.exit.swapMs, endMs: TIMING.exit.totalMs },
] as const;

export type Phase =
  | "hero"
  | "chrome-out"
  | "waiting"
  | "entering"
  | "game"
  | "leaving"
  | "returning";

/** Value written to `document.documentElement.dataset.experience` for each phase. */
export function experienceAttribute(phase: Phase): "hero" | "leaving" | "game" | "returning" {
  switch (phase) {
    case "hero":
      return "hero";
    case "chrome-out":
    case "waiting":
      return "leaving";
    case "entering":
    case "game":
    case "leaving":
      return "game";
    case "returning":
      return "returning";
  }
}
