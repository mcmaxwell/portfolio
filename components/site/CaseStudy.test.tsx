// @vitest-environment jsdom
// Every featured project card has a case page behind it, and each page renders its story with the
// links the reader needs: the live product, the next case and the way back.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseStudy } from "@/components/site/CaseStudy";
import { caseBySlug, caseForProject, cases, nextCase } from "@/data/cases";
import { projects } from "@/data";

// The case links navigate client-side (TransitionLink), which needs the app router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

// Reduced motion, so the case videos stay on their posters (jsdom has no media playback).
window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

afterEach(cleanup);

describe("case studies", () => {
  it("cover every featured project, once each", () => {
    const featured = projects.filter((p) => p.img);
    for (const p of featured) expect(caseForProject(p.id), p.title).toBeDefined();
    expect(new Set(cases.map((c) => c.slug)).size).toBe(cases.length);
    expect(new Set(cases.map((c) => c.projectId)).size).toBe(cases.length);
    expect(caseBySlug("nope")).toBeUndefined();
  });

  it("keeps every fact a short scale number with a label", () => {
    for (const c of cases) {
      expect(c.facts).toHaveLength(3);
      for (const f of c.facts) {
        expect(f.value.length).toBeLessThanOrEqual(6);
        expect(f.label.length).toBeGreaterThan(3);
      }
    }
  });

  it("renders each page with its sections and links", () => {
    for (const c of cases) {
      const { container, unmount } = render(<CaseStudy c={c} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(c.name);
      for (const label of ["Problem", "What I built", "How it works", "Results", "My role", "Stack"]) {
        expect(screen.getByRole("heading", { level: 2, name: label })).toBeInTheDocument();
      }
      const nav = screen.getByRole("navigation", { name: /case navigation/i });
      expect(within(nav).getByRole("link", { name: /all work/i })).toHaveAttribute("href", "/#projects");
      expect(within(nav).getByRole("link", { name: new RegExp(`next: ${nextCase(c.slug).name}`, "i") })).toHaveAttribute(
        "href",
        `/work/${nextCase(c.slug).slug}`
      );
      if (c.link) expect(screen.getByRole("link", { name: new RegExp(c.linkLabel!) })).toHaveAttribute("href", c.link);
      if (c.clients) for (const cl of c.clients) expect(screen.getByText(cl.work)).toBeInTheDocument();
      // The view transition names match the card's, so the card morphs into the page.
      expect(container.querySelector("h1")?.getAttribute("style")).toContain(`case-title-${c.slug}`);
      unmount();
    }
  });
});
