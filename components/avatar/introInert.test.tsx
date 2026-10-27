// @vitest-environment jsdom
// While the intro video covers the hero, the controls beneath it must be inert (no Tab stop, no
// click) and the game prefetch must not start; once the intro ends, Play behaves as before.
// With NEXT_PUBLIC_INTRO_VIDEO=off the hero is unchanged.
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
vi.mock("@/components/avatar/Avatar", () => ({ Avatar: () => <span data-testid="avatar" />, preloadAvatar: () => {} }));
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

async function mountHero(intro: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_INTRO_VIDEO", intro ? "" : "off");
  const { default: TalkingAvatar } = await import("@/components/avatar/TalkingAvatar");
  const view = render(<TalkingAvatar />);
  const play = (await screen.findByText(/play \/ explore/)) as HTMLButtonElement;
  // With the intro playing the avatar is only built near the film's end, so Play stays disabled.
  if (!intro) await waitFor(() => expect(play).toBeEnabled());
  return { ...view, play };
}

beforeEach(() => {
  prefetchSpy.mockClear();
  window.history.pushState({}, "", "/?intro");
  sessionStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response())));
  vi.spyOn(console, "error").mockImplementation(() => {}); // unknown three.js tags rendered into the stand-in canvas
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hero under the intro video", () => {
  it("makes the covered controls inert and defers the prefetch until the intro ends", async () => {
    const { container, play } = await mountHero(true);
    const video = await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      return v!;
    });
    // Every covered control sits inside an inert subtree, so none can take a Tab stop.
    const talk = screen.getByText(/talk to me/);
    const gesture = container.querySelector("[data-xfade]") as HTMLElement;
    expect(talk.closest("[inert]")).not.toBeNull();
    expect(play.closest("[inert]")).not.toBeNull();
    expect(gesture.closest("[inert]")).not.toBeNull();
    for (const b of screen.getAllByText(/^(wave|run)$/)) {
      expect(b.closest("[inert]")).not.toBeNull();
    }
    // The cover's own controls stay live, and the sound toggle unmutes the film.
    expect(screen.getByRole("button", { name: /skip intro/i }).closest("[inert]")).toBeNull();
    const sound = screen.getByRole("button", { name: /turn sound on/i });
    expect(sound.closest("[inert]")).toBeNull();
    expect(video.muted).toBe(true);
    fireEvent.click(sound);
    expect(video.muted).toBe(false);
    expect(sound).toHaveAttribute("aria-pressed", "true");

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

  it("builds the avatar only in the film's last seconds", async () => {
    const { container } = await mountHero(true);
    const video = await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      return v!;
    });
    expect(screen.queryByTestId("avatar")).toBeNull();
    Object.defineProperty(video, "duration", { configurable: true, value: 49.4 });
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 20 });
    fireEvent.timeUpdate(video);
    expect(screen.queryByTestId("avatar")).toBeNull();
    video.currentTime = 35;
    fireEvent.timeUpdate(video);
    await waitFor(() => expect(screen.getByTestId("avatar")).toBeInTheDocument());
  });

  it("leaves the hero unchanged when the intro is switched off", async () => {
    const { container, play } = await mountHero(false);
    await act(async () => {});
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();
    fireEvent.focus(play);
    expect(prefetchSpy).toHaveBeenCalledTimes(1);
  });
});
