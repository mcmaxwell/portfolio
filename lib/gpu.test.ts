// @vitest-environment jsdom
// CPU-drawn WebGL is told apart by the renderer string; anything unknown counts as a real GPU.
import { describe, expect, it } from "vitest";
import { SOFTWARE_RENDERER } from "@/lib/gpu";

describe("SOFTWARE_RENDERER", () => {
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)",
    "Google SwiftShader",
  ])("matches %s", (r) => expect(SOFTWARE_RENDERER.test(r)).toBe(true));

  it.each([
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Adreno (TM) 740",
    "Mali-G78",
  ])("does not match %s", (r) => expect(SOFTWARE_RENDERER.test(r)).toBe(false));
});
