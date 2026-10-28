// @vitest-environment jsdom
// Moving to another page is a client-side navigation inside a view transition, and the transition
// ends once the new route has rendered. Without view transitions it stays a plain Next link.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));

import { RouteSettled, TransitionLink } from "@/components/site/TransitionLink";

type Doc = Document & { startViewTransition?: unknown };

beforeEach(() => {
  push.mockClear();
  pathname = "/";
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  delete (document as Doc).startViewTransition;
});

describe("TransitionLink", () => {
  it("navigates inside a view transition and ends it when the route renders", async () => {
    let update: (() => Promise<void>) | undefined;
    (document as Doc).startViewTransition = vi.fn((u: () => Promise<void>) => {
      update = u;
      return { ready: Promise.resolve(), finished: Promise.resolve() };
    });
    const { rerender } = render(
      <>
        <RouteSettled />
        <TransitionLink href="/work/newsstocks">NewsStocks</TransitionLink>
      </>
    );
    fireEvent.click(screen.getByRole("link", { name: "NewsStocks" }));
    expect((document as Doc).startViewTransition).toHaveBeenCalledOnce();

    let settled = false;
    const done = update!().then(() => (settled = true));
    expect(push).toHaveBeenCalledWith("/work/newsstocks");
    await Promise.resolve();
    expect(settled).toBe(false);

    pathname = "/work/newsstocks";
    rerender(
      <>
        <RouteSettled />
        <TransitionLink href="/work/newsstocks">NewsStocks</TransitionLink>
      </>
    );
    await act(() => done);
    expect(settled).toBe(true);
  });

  it("leaves the click to Next without view transitions, with reduced motion or a modifier key", () => {
    render(<TransitionLink href="/colophon">Colophon</TransitionLink>);
    const link = screen.getByRole("link", { name: "Colophon" });

    expect(fireEvent.click(link)).toBe(true);
    expect(push).not.toHaveBeenCalled();

    const start = vi.fn();
    (document as Doc).startViewTransition = start;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    fireEvent.click(link);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    fireEvent.click(link, { metaKey: true });
    expect(start).not.toHaveBeenCalled();
  });
});
