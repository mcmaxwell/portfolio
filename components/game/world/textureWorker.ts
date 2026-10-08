// Texture worker: paints the procedural world textures off the main thread (OffscreenCanvas) and posts
// each one back as an ImageBitmap, already flipped vertically so it matches a CanvasTexture with
// flipY (an ImageBitmap ignores flipY). Started from textures.ts at prefetch time; any failure
// there falls back to painting on the main thread, so this file is an optimisation only.
import { PAINTERS, type TexName } from "./texturePaint";

type Scope = {
  onmessage: ((e: { data: { names: TexName[] } }) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const scope = self as unknown as Scope;

scope.onmessage = async (e) => {
  for (const name of e.data.names) {
    try {
      const canvas = await PAINTERS[name](async () => {});
      const bitmap = await createImageBitmap(canvas as OffscreenCanvas, { imageOrientation: "flipY" });
      scope.postMessage({ name, bitmap }, [bitmap]);
    } catch (err) {
      scope.postMessage({ name, error: err instanceof Error ? err.message : String(err) });
      return;
    }
  }
};
