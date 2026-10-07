// @vitest-environment jsdom
// Portfolio panels and the interaction prompt (design 9, M3): content from the data only, links
// that open on activation only (one tab, noopener noreferrer), focus trap, Escape and Close,
// focus back to the game, movement released while a panel is open, and the prompt keys.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The tests import the placeholder testimonials only to prove that none of their text reaches the game.
// eslint-disable-next-line no-restricted-imports
import { projects, testimonials } from "@/data";
import { education, experience, owner, skills } from "@/lib/persona";
import type { Interactable, PanelId } from "../config";
import { createGame, type GameHandle } from "../session";
import { GameInterface } from "../ui/GameInterface";
import { PortfolioPanel } from "../ui/panels";
import { CAMPUS } from "../world/layout";

afterEach(cleanup);

const noop = () => {};
const panel = (p: PanelId, onClose: () => void = noop, onOpen: (p: PanelId) => void = noop) => render(<PortfolioPanel panel={p} onClose={onClose} onOpen={onOpen} />);
const anchors = () => Array.from(document.querySelectorAll("a"));
const text = () => document.body.textContent ?? "";

describe("project panel (the three featured projects)", () => {
  for (const id of [1, 2, 3] as const) {
    const raw = projects[id - 1];
    it(`project ${id}: title, description, screenshot, technologies and link exactly as in data/index.ts`, () => {
      panel({ kind: "project", projectId: id });
      const dialog = screen.getByRole("dialog", { name: raw.title });
      expect(within(dialog).getByRole("heading", { level: 2, name: raw.title })).toBeInTheDocument();
      expect(within(dialog).getByText(raw.des)).toBeInTheDocument();
      expect(within(dialog).getByAltText(`Screenshot of ${raw.title}`)).toHaveAttribute("src", raw.img);
      const icons = Array.from(dialog.querySelectorAll("li img"));
      expect(icons.map((i) => i.getAttribute("src"))).toEqual(raw.iconLists);
      for (const i of icons) expect(i).toHaveAttribute("alt", ""); // decorative: the data has no technology names
      expect(within(dialog).getByText(raw.tag!)).toBeInTheDocument();
      // Exactly one link, the data's, in one new tab, never opened by the panel itself.
      expect(anchors()).toHaveLength(1);
      const a = anchors()[0];
      expect(a).toHaveAttribute("href", raw.link);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    });
  }

  it("never opens a window or navigates by itself", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    panel({ kind: "project", projectId: 1 });
    panel({ kind: "contact" });
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("offers a way on to all projects, which swaps the panel", () => {
    const onOpen = vi.fn();
    panel({ kind: "project", projectId: 2 }, noop, onOpen);
    fireEvent.click(screen.getByText("[ all projects ]"));
    expect(onOpen).toHaveBeenCalledWith({ kind: "all-projects" });
  });
});

describe("all projects, skills, experience and contact", () => {
  it("all projects: every project of the data, private ones without a link, clients as links", () => {
    panel({ kind: "all-projects" });
    const dialog = screen.getByRole("dialog", { name: "All projects" });
    for (const p of projects) {
      expect(within(dialog).getByText(p.title)).toBeInTheDocument();
      expect(within(dialog).getByText(p.des)).toBeInTheDocument();
    }
    const httpLinks = projects.filter((p) => p.link?.startsWith("http")).map((p) => p.link);
    const clientLinks = projects.flatMap((p) => ("clients" in p && p.clients ? p.clients.map((c) => c.url) : []));
    expect(anchors().map((a) => a.getAttribute("href"))).toEqual([...httpLinks, ...clientLinks].sort((a, b) => anchorOrder(a!) - anchorOrder(b!)));
    expect(within(dialog).getAllByText("private").length).toBe(projects.filter((p) => !p.link?.startsWith("http")).length);
    for (const a of anchors()) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  // Anchors appear in project order, clients inside their project; recompute that order for the comparison.
  function anchorOrder(href: string): number {
    const hrefs: string[] = [];
    for (const p of projects) {
      if (p.link?.startsWith("http")) hrefs.push(p.link);
      if ("clients" in p && p.clients) for (const c of p.clients) hrefs.push(c.url);
    }
    return hrefs.indexOf(href);
  }

  it("skills: three readable groups holding every persona skill line unchanged", () => {
    panel({ kind: "skills" });
    const dialog = screen.getByRole("dialog", { name: "Skills" });
    expect(within(dialog).getAllByRole("region").length).toBe(3);
    for (const line of skills) {
      const i = line.indexOf(": ");
      expect(within(dialog).getByText(line.slice(0, i))).toBeInTheDocument();
      expect(within(dialog).getByText(line.slice(i + 2))).toBeInTheDocument();
    }
    expect(anchors()).toHaveLength(0);
  });

  it("experience: every role in order, then education", () => {
    panel({ kind: "experience" });
    const dialog = screen.getByRole("dialog", { name: "Experience" });
    const roles = within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(roles.slice(0, experience.length)).toEqual(experience.map((e) => e.role));
    for (const e of experience) expect(within(dialog).getByText(e.detail)).toBeInTheDocument();
    for (const e of education) expect(within(dialog).getByText(e)).toBeInTheDocument();
  });

  it("experience: each entry reads role, company, period, detail with no separator character and no empty field (QA stray '|' and comma)", () => {
    panel({ kind: "experience" });
    const dialog = screen.getByRole("dialog", { name: "Experience" });
    const items = within(dialog).getAllByRole("listitem").slice(0, experience.length);
    expect(items).toHaveLength(experience.length);
    items.forEach((li, i) => {
      const e = experience[i];
      const pieces = Array.from(li.querySelectorAll("h3, p span, p")).filter((n) => n.children.length === 0 && n.getAttribute("aria-hidden") !== "true").map((n) => n.textContent ?? "");
      // The text leaves are exactly the persona fields, nothing else; the divider is an aria-hidden CSS rule with no text.
      for (const d of Array.from(li.querySelectorAll('[aria-hidden="true"]'))) expect(d.textContent).toBe("");
      expect(pieces).toEqual([e.role, e.company, e.period, e.detail]);
      for (const piece of pieces) expect(piece.trim()).not.toBe("");
      const flat = (li.textContent ?? "").replace(/\s+/g, " ").trim();
      expect(flat).toContain(`${e.company} ${e.period}`); // read as words, in order
      expect(flat).not.toMatch(/\|/);
      expect(flat).not.toContain(`${e.company} , `);
      expect(flat).not.toContain(`${e.company}, ${e.period}`);
    });
  });

  it("contact: email, LinkedIn and the site, as links that open only when activated", () => {
    panel({ kind: "contact" });
    const hrefs = anchors().map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`mailto:${owner.email}`, owner.linkedin, `https://${owner.site}`]);
    const [mail, linkedin, site] = anchors();
    expect(mail).not.toHaveAttribute("target"); // a mail client, not a tab
    expect(linkedin).toHaveAttribute("target", "_blank");
    expect(site).toHaveAttribute("target", "_blank");
    for (const a of anchors()) expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(text()).not.toContain(owner.phone);
  });

  it("no panel shows testimonial text or a placeholder name", () => {
    const kinds: PanelId[] = [{ kind: "project", projectId: 1 }, { kind: "project", projectId: 2 }, { kind: "project", projectId: 3 }, { kind: "all-projects" }, { kind: "skills" }, { kind: "experience" }, { kind: "contact" }];
    for (const k of kinds) {
      const { unmount } = panel(k);
      for (const t of testimonials) {
        expect(text()).not.toContain(t.quote.slice(0, 40));
        expect(text()).not.toContain(t.name);
      }
      unmount();
    }
  });

  it("a panel kind that is not shipped yet shows a plain notice with a working Close", () => {
    const onClose = vi.fn();
    panel({ kind: "settings" }, onClose);
    expect(screen.getByRole("dialog", { name: "Not available yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close panel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("panel keyboard and focus behaviour", () => {
  it("is a labelled modal dialog whose focus starts on the Close button", () => {
    panel({ kind: "skills" });
    const d = screen.getByRole("dialog");
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(document.getElementById(d.getAttribute("aria-labelledby")!)?.textContent).toBe("Skills");
    expect(screen.getByLabelText("Close panel")).toHaveFocus();
  });

  it("Tab and Shift+Tab stay inside the panel (the project panel has Close, the link and all projects)", () => {
    panel({ kind: "project", projectId: 1 });
    const d = screen.getByRole("dialog");
    const stops = [screen.getByLabelText("Close panel"), anchors()[0], screen.getByText("[ all projects ]")];
    stops[0].focus();
    fireEvent.keyDown(d, { key: "Tab" });
    fireEvent.keyDown(d, { key: "Tab" });
    stops[2].focus();
    fireEvent.keyDown(d, { key: "Tab" }); // wraps to the first
    expect(stops[0]).toHaveFocus();
    fireEvent.keyDown(d, { key: "Tab", shiftKey: true }); // wraps to the last
    expect(stops[2]).toHaveFocus();
  });

  it("Escape and the Close button each close it once", () => {
    const onClose = vi.fn();
    panel({ kind: "contact" }, onClose);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("Close panel"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("returns focus to the element that had it before the panel opened", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = panel({ kind: "contact" });
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("is operable by screen reader landmarks: headings, lists and described links", () => {
    panel({ kind: "all-projects" });
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(projects.length);
    // Every external link says it opens a new tab.
    for (const a of anchors()) expect(a.textContent).toContain("(opens in a new tab)");
  });
});

// ---- inside the game interface -------------------------------------------------------------

let game: GameHandle;
const mode = () => game.session.getState().mode;
const matchMedia = (coarse: boolean) =>
  (((q: string) => ({ matches: coarse && q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown) as typeof window.matchMedia;

function mountGame(coarse = false) {
  window.matchMedia = matchMedia(coarse);
  game = createGame({ reducedMotion: true });
  act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
  return render(<GameInterface game={game} onExit={noop} />);
}
const item = (over: Partial<Interactable> = {}): Interactable => ({ ...CAMPUS.interactables.find((i) => i.id === "lab-xecsuite")!, ...over });
const key = (code: string) => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code === "Escape" ? "Escape" : code, cancelable: true })));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  game?.dispose();
  vi.useRealTimers();
});

describe("interaction prompt", () => {
  it("shows E and the action with the project name on a keyboard device", () => {
    mountGame();
    expect(document.querySelector("[data-interaction-prompt] kbd")).toBeNull();
    act(() => game.focus.set(item()));
    expect(document.querySelector("[data-interaction-prompt] kbd")?.textContent).toBe("E");
    expect(document.querySelector("[data-interaction-prompt]")?.textContent).toContain("View project: XecSuite");
    expect(screen.getByText("Press E to View project: XecSuite")).toBeInTheDocument(); // the live region says it too
  });

  it("names the Interact button on a touch device", () => {
    mountGame(true);
    act(() => game.focus.set(item()));
    expect(document.querySelector("[data-interaction-prompt] kbd")?.textContent).toBe("Interact");
    expect(screen.getByText("Press the Interact button to View project: XecSuite")).toBeInTheDocument();
  });

  it("the touch Interact button appears only while something is in reach and presses interact", () => {
    mountGame(true);
    expect(document.querySelector("[data-interact-button]")).toBeNull();
    act(() => game.focus.set(item()));
    const button = document.querySelector<HTMLElement>("[data-interact-button]")!;
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Interact: View project: XecSuite");
    game.input.attach(document.createElement("div"));
    fireEvent.pointerDown(button);
    expect(game.input.sample().interact).toBe(true);
    act(() => game.focus.set(null));
    expect(document.querySelector("[data-interact-button]")).toBeNull();
  });

  it("is hidden while a panel is open", () => {
    mountGame();
    act(() => game.focus.set(item()));
    act(() => game.session.dispatch({ type: "OPEN_PANEL", panel: { kind: "skills" } }));
    expect(document.querySelector("[data-interaction-prompt] kbd")).toBeNull();
  });

  it("the controls hint mentions E", () => {
    mountGame();
    expect(document.body.textContent).toContain("E interact");
  });
});

describe("panels inside the game", () => {
  const open = (p: PanelId) => act(() => game.session.dispatch({ type: "OPEN_PANEL", panel: p }));

  it("opening a panel shows it, pauses movement (releases held keys) and removes the HUD buttons from the tab order", () => {
    mountGame();
    game.input.attach(document.createElement("div"));
    key("KeyW");
    expect(game.input.sample().move.y).toBe(1);
    open({ kind: "project", projectId: 1 });
    expect(mode()).toBe("panel");
    expect(screen.getByRole("dialog", { name: projects[0].title })).toBeInTheDocument();
    expect(game.input.sample().move).toEqual({ x: 0, y: 0 }); // released, and keys are ignored now
    key("KeyW");
    expect(game.input.sample().move.y).toBe(0);
    expect(document.querySelector("[inert]")).not.toBeNull(); // the HUD buttons
  });

  it("Escape closes the panel (and does not also pause), then focus is on the game overlay", () => {
    mountGame();
    open({ kind: "skills" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(mode()).toBe("playing");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector("[data-game-overlay]"));
    expect(document.querySelector("[data-game-announce]")?.textContent).toBe("Panel closed. Back in the game.");
  });

  it("Escape still closes the panel when focus has left the dialog (a click outside), instead of pausing", () => {
    mountGame();
    open({ kind: "skills" });
    (document.activeElement as HTMLElement).blur();
    key("Escape");
    expect(mode()).toBe("playing");
  });

  it("the Close button closes it and focus returns to the overlay", () => {
    mountGame();
    open({ kind: "contact" });
    fireEvent.click(screen.getByLabelText("Close panel"));
    expect(mode()).toBe("playing");
    expect(document.activeElement).toBe(document.querySelector("[data-game-overlay]"));
  });

  it("swapping from a project to all projects keeps one dialog and focus inside it", () => {
    mountGame();
    open({ kind: "project", projectId: 3 });
    fireEvent.click(screen.getByText("[ all projects ]"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "All projects" })).toBeInTheDocument();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    expect(mode()).toBe("panel");
  });

  it("a tab hide or blur while a panel is open does not pause over it", () => {
    mountGame();
    open({ kind: "skills" });
    act(() => void window.dispatchEvent(new Event("blur")));
    expect(mode()).toBe("panel");
  });
});
