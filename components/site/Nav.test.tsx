// @vitest-environment jsdom
// The phone menu sits above the memory particles: while it is open the header is raised over their
// layer and <html data-menu> hides them (globals.css).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Nav } from "@/components/site/Nav";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe("Nav phone menu", () => {
  it("raises the header over the particle layer and hides the particles while open", () => {
    const { container } = render(<Nav />);
    const header = container.querySelector("header")!;
    const root = document.documentElement;
    expect(header.className).toContain("z-40");
    expect(root.dataset.menu).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    expect(header.className).toContain("z-50");
    expect(root.dataset.menu).toBe("");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(header.className).toContain("z-40");
    expect(root.dataset.menu).toBeUndefined();
  });
});
