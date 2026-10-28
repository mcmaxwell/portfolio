// @vitest-environment jsdom
// While the intro video covers the hero, the controls beneath it must be inert (no Tab stop, no
// click) and the game prefetch must not start; once the intro ends, Play behaves as before.
// The avatar itself is held back while the film plays, until the film cues it (near its end, on
// skip or on failure). With NEXT_PUBLIC_INTRO_VIDEO_URL set to an empty string (intro off) the hero
// is unchanged.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prefetchSpy = vi.fn();

// R3F cannot run in jsdom: render the scene children into a plain div so the avatar's ReadySignal
// still fires (that is what enables Play).
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children?: ReactNode }) => <div data-testid="canvas">{children}</div>,
  useFrame: () => {},
  useThree: () => ({}),
}));
vi.mock("@react-three/drei", () => ({ Html: () => null }));
vi.mock("@/components/avatar/Avatar", () => ({ Avatar: () => null, preloadAvatar: () => {} }));
// The real loader, with only prefetch observed: this is the call the Play focus must not make early.
vi.mock("@/components/game/shell/gameLoader", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/game/shell/gameLoader")>();
  return {
    ...mod,
    createGameLoader: (...args: Parameters<typeof mod.createGameLoader>) => {
      const loader = mod.createGameLoader(...args);
      return { ...loader, prefetch: prefetchSpy };
    },
  };
});

async function mountHero(introUrl: string | undefined) {
  vi.resetModules();
  if (introUrl) vi.stubEnv("NEXT_PUBLIC_INTRO_VIDEO_URL", introUrl);
  else vi.stubEnv("NEXT_PUBLIC_INTRO_VIDEO_URL", "");
  const { default: TalkingAvatar } = await import("@/components/avatar/TalkingAvatar");
  const view = render(<TalkingAvatar />);
  const play = (await screen.findByText(/play \/ explore/)) as HTMLButtonElement;
  if (!introUrl) await waitFor(() => expect(play).toBeEnabled());
  return { ...view, play };
}

beforeEach(() => {
  prefetchSpy.mockClear();
  window.history.pushState({}, "", "/?intro");
  sessionStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {}); // unknown three.js tags rendered into the stand-in canvas
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("hero under the intro video", () => {
  it("makes the covered controls inert and defers the avatar and the prefetch until the intro ends", async () => {
    const { container, play } = await mountHero("/intro-test.mp4");
    const video = await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      return v!;
    });
    // Every covered control sits inside an inert subtree, so none can take a Tab stop.
    const talk = screen.getByText(/talk to me/);
    expect(talk.closest("[inert]")).not.toBeNull();
    expect(play.closest("[inert]")).not.toBeNull();
    expect(screen.getByText(/make me move/i).closest("[inert]")).not.toBeNull();
    expect(screen.getByText(/watch the film/i).closest("[inert]")).not.toBeNull();
    // The skip button belongs to the cover and stays live.
    expect(screen.getByRole("button", { name: /skip film/i }).closest("[inert]")).toBeNull();

    // The avatar has not loaded under the film, so Play is not enabled yet.
    await act(async () => {});
    expect(play).toBeDisabled();

    // Programmatic focus, hover and press do not start the prefetch while the intro plays.
    fireEvent.focus(play);
    fireEvent.pointerEnter(play);
    fireEvent.pointerDown(play);
    expect(prefetchSpy).not.toHaveBeenCalled();

    // The intro ends: after the fade the controls are live again and Play prefetches as before.
    fireEvent.ended(video);
    await waitFor(() => expect(container.querySelector("video")).toBeNull());
    await waitFor(() => expect(play).toBeEnabled());
    expect(play.closest("[inert]")).toBeNull();
    expect(talk.closest("[inert]")).toBeNull();
    fireEvent.focus(play);
    expect(prefetchSpy).toHaveBeenCalledTimes(1);
    fireEvent.pointerEnter(play);
    fireEvent.pointerDown(play);
    expect(prefetchSpy).toHaveBeenCalledTimes(3);
  });

  it("waits for the Watch the film button instead of playing on load", async () => {
    window.history.pushState({}, "", "/");
    const { container, play } = await mountHero("/intro-test.mp4");
    // No film on load: the avatar loads straight away and the hero is live.
    expect(container.querySelector("video")).toBeNull();
    await waitFor(() => expect(play).toBeEnabled());
    expect(container.querySelector("[inert]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /watch the film/i }));
    const video = await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      return v!;
    });
    // Opened by a click, so it starts with sound, and the controls beneath are inert while it plays.
    expect(video.muted).toBe(false);
    expect(play.closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /skip film/i }));
    await waitFor(() => expect(container.querySelector("video")).toBeNull());
    expect(play.closest("[inert]")).toBeNull();
  });

  it("keeps the moves behind Make me move", async () => {
    window.history.pushState({}, "", "/");
    await mountHero(undefined);
    expect(screen.queryByText(/^wave$/)).toBeNull();
    const toggle = screen.getByRole("button", { name: /make me move/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^wave$/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/^wave$/)).toBeNull();
  });

  it("leaves the hero unchanged when the intro is turned off", async () => {
    const { container, play } = await mountHero(undefined);
    await act(async () => {});
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();
    expect(screen.queryByText(/watch the film/i)).toBeNull();
    fireEvent.focus(play);
    expect(prefetchSpy).toHaveBeenCalledTimes(1);
  });
});
