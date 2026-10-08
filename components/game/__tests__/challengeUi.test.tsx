// @vitest-environment jsdom
// Challenge interface: the "Energy cells n/3" live region, the guidance after the third cell,
// Restart in the pause menu (settings kept) and the completion panel actions.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectCell } from "../progress";
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
