/**
 * Whether WebGL here is drawn by the CPU (SwiftShader, llvmpipe, Microsoft Basic Render Driver):
 * GPU acceleration is off or blocklisted, so every 3D frame is a long main-thread task. The hero
 * then draws only when something changes (pointer, gesture, voice) instead of 60 times a second,
 * and the particle layer stays off. Measured once per page.
 */
let cached: boolean | null = null;

export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function isSoftwareGL(): boolean {
  if (cached !== null) return cached;
  cached = false;
  if (typeof document === "undefined") return cached;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return cached;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    cached = SOFTWARE_RENDERER.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Keep the default: treat it as a real GPU.
  }
  return cached;
}
