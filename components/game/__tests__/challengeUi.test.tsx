// @vitest-environment jsdom
// Challenge interface: the "Energy cells n/3" live region, the guidance after the third cell,
// Restart in the pause menu (settings kept) and the completion panel actions.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectCell, collectTrophy, restartChallenge } from "../progress";
import { createGame, type GameHandle } from "../session";
import { GameInterface } from "../ui/GameInterface";

let game: GameHandle;
const key = (code: string) => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code, cancelable: true })));
const collect = (...ids: Array<"lab" | "workshop" | "tower">) => act(() => ids.forEach((id) => game.progress.update((p) => collectCell(p, id))));

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  game = createGame({ reducedMotion: true, storage: null });
  render(<GameInterface game={game} onExit={vi.fn()} />);
  act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
});
afterEach(() => {
  cleanup();
  game.dispose();
  vi.useRealTimers();
});

const counter = () => document.querySelector("[data-energy-counter]") as HTMLElement;

describe("counter and guidance", () => {
  it("shows 'Energy cells n/3' in a polite live region and follows the progress", () => {
    expect(counter()).toHaveTextContent("Energy cells 0/3");
    expect(counter()).toHaveAttribute("aria-live", "polite");
    expect(counter()).toHaveAttribute("role", "status");
    collect("lab");
    expect(counter()).toHaveTextContent("Energy cells 1/3");
    collect("lab", "tower");
    expect(counter()).toHaveTextContent("Energy cells 2/3");
  });

  it("shows the return-to-the-beacon guidance only after the third cell, until the beacon is lit", () => {
    const guidance = () => document.querySelector("[data-challenge-guidance]") as HTMLElement;
    collect("lab", "workshop");
    expect(guidance()).toHaveTextContent("");
    collect("tower");
    expect(guidance()).toHaveTextContent(/Return to the glowing beacon in the plaza/);
    expect(guidance()).toHaveAttribute("aria-live", "polite");
    act(() => game.progress.update((p) => ({ ...p, completed: true })));
    expect(guidance()).toHaveTextContent("");
  });
});

describe("layout under the Exit button (F3)", () => {
  it("the counter is as tall as the 44 px buttons and the chips are 12 px apart, so the guidance sits clear of the Exit row", () => {
    // jsdom has no layout; the 12 px clearance below the Exit row (16 + 44 + 12) is measured in the browser (m5 f3.mjs).
    expect(counter().className).toContain("min-h-[44px]");
    expect((document.querySelector("[data-challenge-hud]") as HTMLElement).className).toContain("gap-3");
  });
});

describe("beacon hint before three cells", () => {
  const hintItem = { id: "beacon", kind: "beacon", position: { x: 0, y: 0, z: 1.5 }, radius: 2, prompt: "Light the beacon" } as never;
  const region = () => document.querySelector("[data-interaction-prompt] [role=status]") as HTMLElement;

  it("says how many cells are missing in a polite live region and as a non-interactive chip without a key", () => {
    act(() => game.hint.set(hintItem));
    expect(region()).toHaveTextContent("Collect 3 energy cells to power the beacon");
    const chip = document.querySelector("[data-interaction-hint]") as HTMLElement;
    expect(chip).toHaveTextContent("Collect 3 energy cells to power the beacon");
    expect(chip.querySelector("kbd, button, a")).toBeNull();
    collect("lab");
    expect(region()).toHaveTextContent("Collect 2 more energy cells to power the beacon");
    collect("lab", "workshop");
    expect(region()).toHaveTextContent("Collect 1 more energy cell to power the beacon");
  });

  it("is not shown away from the beacon, outside the playing mode, or in place of the prompt", () => {
    expect(document.querySelector("[data-interaction-hint]")).toBeNull();
    act(() => game.hint.set(hintItem));
    expect(document.querySelector("[data-interaction-hint]")).not.toBeNull();
    act(() => game.focus.set({ id: "lab-screen", kind: "project", position: { x: 0, y: 0, z: 0 }, radius: 1, prompt: "View project", panel: "projects" } as never));
    expect(document.querySelector("[data-interaction-hint]")).toBeNull();
    act(() => game.focus.set(null));
    key("Escape");
    expect(document.querySelector("[data-interaction-hint]")).toBeNull();
  });
});

describe("Restart in the pause menu", () => {
  it("clears the cells and the completion, keeps settings and returns to the game", () => {
    act(() => game.progress.update((p) => ({ ...p, settings: { ...p.settings, quality: "low" } })));
    collect("lab", "workshop", "tower");
    act(() => game.progress.update((p) => ({ ...p, completed: true })));
    key("Escape");
    expect(game.session.getState().mode).toBe("paused");
    fireEvent.click(screen.getByText("[ restart challenge ]"));
    expect(game.progress.getState()).toMatchObject({ collected: [], completed: false, settings: { quality: "low" } });
    expect(game.session.getState().mode).toBe("playing");
    expect(counter()).toHaveTextContent("Energy cells 0/3");
  });
});

describe("completion panel", () => {
  beforeEach(() => {
    collect("lab", "workshop", "tower");
    act(() => {
      game.session.dispatch({ type: "BEACON_ACTIVATED" });
      game.session.dispatch({ type: "CELEBRATION_DONE" });
    });
  });

  it("is a labelled dialog with Explore more, View projects and Contact, focus on Explore more", () => {
    expect(screen.getByRole("dialog", { name: "Challenge complete" })).toBeInTheDocument();
    expect(screen.getByText("[ explore more ]")).toHaveFocus();
    expect(screen.getByText("[ view projects ]")).toBeInTheDocument();
    expect(screen.getByText("[ contact ]")).toBeInTheDocument();
  });

  it("Explore more closes it and returns to the game", () => {
    fireEvent.click(screen.getByText("[ explore more ]"));
    expect(game.session.getState().mode).toBe("playing");
  });

  it("View projects opens the all-projects panel and Contact opens the contact panel", () => {
    fireEvent.click(screen.getByText("[ view projects ]"));
    expect(game.session.getState().panel).toEqual({ kind: "all-projects" });
    expect(screen.getByRole("dialog", { name: "All projects" })).toBeInTheDocument();
    act(() => game.session.dispatch({ type: "OPEN_PANEL", panel: { kind: "completion" } }));
    fireEvent.click(screen.getByText("[ contact ]"));
    expect(game.session.getState().panel).toEqual({ kind: "contact" });
  });
});

describe("trophy", () => {
  const announce = () => document.querySelector("[data-game-announce]") as HTMLElement;
  const chip = () => document.querySelector("[data-trophy-chip]");

  it("collecting it announces 'Trophy collected' in the polite live region and keeps a chip on screen", () => {
    expect(announce()).toHaveAttribute("aria-live", "polite");
    expect(chip()).toBeNull();
    act(() => game.progress.update(collectTrophy));
    expect(announce()).toHaveTextContent("Trophy collected");
    expect(chip()).toHaveTextContent("Trophy collected");
    expect(chip()).toHaveAttribute("aria-hidden", "true"); // announced once, by the live region
  });

  it("Restart removes the chip", () => {
    act(() => game.progress.update(collectTrophy));
    act(() => game.progress.update(restartChallenge));
    expect(chip()).toBeNull();
  });
});

describe("trophy restored from a saved record", () => {
  it("is shown without being announced again", () => {
    cleanup();
    game.dispose();
    game = createGame({ reducedMotion: true, storage: null });
    game.progress.update(collectTrophy);
    render(<GameInterface game={game} onExit={vi.fn()} />);
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    expect(document.querySelector("[data-trophy-chip]")).not.toBeNull();
    expect(document.querySelector("[data-game-announce]")).not.toHaveTextContent("Trophy collected");
  });
});
