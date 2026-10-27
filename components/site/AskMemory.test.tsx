// @vitest-environment jsdom
// The section answers with the server's retrieval when it can, ranks by keywords in the browser
// when it cannot, and the "Who are you?" lens changes the suggestions and the contact pitch.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskMemory } from "@/components/site/AskMemory";
import { Contact } from "@/components/site/Contact";
import { LENS_PITCH, LENS_QUESTIONS } from "@/lib/memory/lenses";

beforeEach(() => {
  window.localStorage.clear();
  window.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AskMemory", () => {
  it("shows the server's answer, the steps and the passages it used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            mode: "semantic",
            corpusSize: 50,
            matches: [{ id: "case-xecsuite", score: 0.71 }],
            answer: "XecSuite runs the back office of a logistics company.",
            model: { embedding: "text-embedding-3-small", answer: "gpt-4o-mini" },
            timings: { embedMs: 120, searchMs: 1, answerMs: 640 },
          }),
          { status: 200 }
        )
      )
    );
    render(<AskMemory />);
    fireEvent.change(screen.getByRole("textbox", { name: /ask my memory/i }), { target: { value: "What is XecSuite?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("XecSuite runs the back office of a logistics company.")).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: /how this answer was made/i });
    expect(within(steps).getByText(/text-embedding-3-small · 120 ms/)).toBeInTheDocument();
    const used = screen.getByRole("list", { name: /memories used/i });
    expect(within(used).getByRole("link", { name: /XecSuite/ })).toHaveAttribute("href", "/work/xecsuite");
    expect(within(used).getByText("similarity 0.71")).toBeInTheDocument();
  });

  it("ranks by keywords in the browser when the server is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    render(<AskMemory />);
    fireEvent.change(screen.getByRole("textbox", { name: /ask my memory/i }), { target: { value: "Magento checkout" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const used = await screen.findByRole("list", { name: /memories used/i });
    expect(within(used).getAllByRole("link").map((a) => a.getAttribute("href"))).toContain("/work/ecommerce");
    expect(screen.getByText(/keyword ranking \(BM25\)/)).toBeInTheDocument();
    expect(within(used).getAllByText(/keyword match/).length).toBeGreaterThan(0);
  });

  it("changes the suggestions and the contact pitch with the lens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    render(
      <>
        <AskMemory />
        <Contact />
      </>
    );
    const suggestions = screen.getByRole("list", { name: /suggested questions/i });
    expect(within(suggestions).getByText(LENS_QUESTIONS.founder[0])).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Recruiter" })));
    expect(screen.getByRole("button", { name: "Recruiter" })).toHaveAttribute("aria-pressed", "true");
    expect(within(suggestions).getByText(LENS_QUESTIONS.recruiter[0])).toBeInTheDocument();
    expect(screen.getByText(LENS_PITCH.recruiter)).toBeInTheDocument();
    expect(window.localStorage.getItem("memory-lens")).toBe("recruiter");
    // A suggestion asks straight away.
    fireEvent.click(within(suggestions).getByText(LENS_QUESTIONS.recruiter[2]));
    await waitFor(() => expect(screen.getByRole("list", { name: /memories used/i })).toBeInTheDocument());
  });

  it("focuses the question on /", () => {
    render(<AskMemory />);
    const input = screen.getByRole("textbox", { name: /ask my memory/i });
    input.scrollIntoView = () => {};
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
  });
});
