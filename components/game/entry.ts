// The one dynamic-import target. Only shell/gameLoader.ts loads this module (ADR-006).
export { createGame } from "./session";
export { loadGameAssets } from "./clips";
export { GameScene } from "./GameScene";
export type { GameSceneProps } from "./GameScene";
export type { GameHandle } from "./session";
export type { GameAssets } from "./clips";
