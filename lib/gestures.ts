// Gesture animation clips available to the avatar. Files live in
// public/animations/<name>.glb. Add a file + a name here to expose a new one.
export const GESTURES = [
  "wave",
  "run",
  "walk",
  "dance",
  "silly_dance",
  "zombie",
  "defeated",
  "dodge",
  "climb",
] as const;

export type GestureName = (typeof GESTURES)[number];

export const gestureUrl = (name: string) => `/animations/${name}.glb`;
export const GESTURE_URLS = GESTURES.map(gestureUrl);
