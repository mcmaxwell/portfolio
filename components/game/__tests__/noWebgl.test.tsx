// @vitest-environment jsdom
// WebGL unavailable (design 3.5): the hero must not try to create a canvas (it would throw and blank
// the whole page) and Play is not offered; the rest of the hero stays.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TalkingAvatar from "@/components/avatar/TalkingAvatar";

// A canvas that cannot get a WebGL context throws while it mounts (as R3F does); that must never be reached.
vi.mock("@react-three/fiber", () => ({
  Canvas: () => {
    throw new Error("Error creating WebGL context.");
  },
  useFrame: () => {},
  useThree: () => ({}),
}));
vi.mock("@react-three/drei", () => ({ Html: () => null }));
vi.mock("@/components/avatar/Avatar", () => ({ Avatar: () => null, preloadAvatar: () => {} }));

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  // jsdom has no canvas context: getContext returns null, exactly the "WebGL unavailable" case.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("hero without WebGL", () => {
  it("renders the hero without a canvas and without a Play button, and does not throw", () => {
    const { container } = render(<TalkingAvatar />);
    expect(container.querySelector("#talk")).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.queryByText(/play \/ explore/)).toBeNull();
    expect(screen.getByText(/talk to me/)).toBeInTheDocument();
  });
});
