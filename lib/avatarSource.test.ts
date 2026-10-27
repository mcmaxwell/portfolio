import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("avatar source", () => {
  it("takes the compressed model where WebAssembly runs, the plain one after a failure", async () => {
    const m = await import("./avatarSource");
    expect(m.avatarUrl()).toBe(m.AVATAR_COMPRESSED);
    expect(m.usesMeshopt(m.avatarUrl())).toBe(true);
    m.markMeshoptBroken();
    expect(m.avatarUrl()).toBe("/avatar.glb");
    expect(m.usesMeshopt("/avatar.glb")).toBe(false);
  });

  it("takes the plain model without WebAssembly", async () => {
    vi.stubGlobal("WebAssembly", undefined);
    const m = await import("./avatarSource");
    expect(m.avatarUrl()).toBe("/avatar.glb");
  });

  it("lets NEXT_PUBLIC_AVATAR_URL win", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_URL", "/custom.glb");
    const m = await import("./avatarSource");
    expect(m.avatarUrl()).toBe("/custom.glb");
  });
});
