// @vitest-environment jsdom
// Dialog: focus on open, Tab trap, Escape, focus return (design 2.10 and 6).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "../shell/Dialog";
import { FailureDialog } from "../shell/LoadingOverlay";

afterEach(cleanup);

function Harness({ onClose = () => {}, withInitial = false }: { onClose?: () => void; withInitial?: boolean }) {
  const [open, setOpen] = useState(false);
  const second = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      <button>outside</button>
      {open && (
        <Dialog
          labelledBy="t"
          initialFocusRef={withInitial ? second : undefined}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <h2 id="t">Title</h2>
          <button>first</button>
          <button ref={second}>second</button>
          <button>third</button>
        </Dialog>
      )}
    </div>
  );
}
const openIt = () => {
  const opener = screen.getByText("opener");
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

describe("Dialog", () => {
  it("is a labelled modal dialog", () => {
    render(<Harness />);
    openIt();
    const d = screen.getByRole("dialog");
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(d).toHaveAttribute("aria-labelledby", "t");
    expect(screen.getByText("Title")).toHaveAttribute("id", "t");
  });

  it("moves focus to the first focusable element on open", () => {
    render(<Harness />);
    openIt();
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("moves focus to initialFocusRef when given", () => {
    render(<Harness withInitial />);
    openIt();
    expect(screen.getByText("second")).toHaveFocus();
  });

  it("falls back to the dialog itself when it has nothing focusable", () => {
    render(
      <Dialog labelledBy="x" onClose={() => {}}>
        <p id="x">only text</p>
      </Dialog>
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("Tab on the last element wraps to the first; Shift+Tab on the first wraps to the last", () => {
    render(<Harness />);
    openIt();
    const last = screen.getByText("third");
    last.focus();
    const tab = fireEvent.keyDown(last, { key: "Tab" });
    expect(tab).toBe(false); // preventDefault was called: the trap moved the focus itself
    expect(screen.getByText("first")).toHaveFocus();
    const shift = fireEvent.keyDown(screen.getByText("first"), { key: "Tab", shiftKey: true });
    expect(shift).toBe(false);
    expect(screen.getByText("third")).toHaveFocus();
  });

  it("Tab in the middle is left to the browser", () => {
    render(<Harness />);
    openIt();
    const mid = screen.getByText("second");
    mid.focus();
    expect(fireEvent.keyDown(mid, { key: "Tab" })).toBe(true);
    expect(mid).toHaveFocus();
  });

  it("pulls focus back inside when it escaped to the page (Tab from outside)", () => {
    render(<Harness />);
    openIt();
    screen.getByText("outside").focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("Escape calls onClose once and does not bubble to a window handler", () => {
    const onClose = vi.fn();
    const windowKey = vi.fn();
    window.addEventListener("keydown", windowKey);
    render(<Harness onClose={onClose} />);
    openIt();
    fireEvent.keyDown(screen.getByText("first"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    // stopPropagation at the React root keeps the event from the page-level pause toggle
    expect(windowKey.mock.calls.filter(([e]) => (e as KeyboardEvent).key === "Escape")).toHaveLength(0);
    window.removeEventListener("keydown", windowKey);
  });

  it("returns focus to the element that had it before opening", () => {
    render(<Harness />);
    const opener = openIt();
    expect(opener).not.toHaveFocus();
    fireEvent.keyDown(screen.getByText("first"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("does not steal focus back to an opener that left the document", () => {
    const { unmount } = render(<Harness />);
    openIt();
    unmount();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("FailureDialog", () => {
  it("offers Retry (focused first) and Back to portfolio, and Escape means Back", () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    render(<FailureDialog title="Could not start the game" message="offline" onRetry={onRetry} onBack={onBack} />);
    expect(screen.getByRole("dialog", { name: "Could not start the game" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
    expect(screen.getByText("[ retry ]")).toHaveFocus();
    fireEvent.click(screen.getByText("[ retry ]"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("[ back to portfolio ]"));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByText("[ retry ]"), { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
