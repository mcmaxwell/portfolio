// @vitest-environment jsdom
// A failed model fetch inside the hero must stay local: retried, then a fallback, never a blank page.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroBoundary, RetryBoundary } from "./LoadBoundary";

// The network is down while `offline` is set (React may render a throwing component twice per attempt).
let offline = false;
function Model() {
  if (offline) throw new Error("Could not load /avatar.glb: Failed to fetch");
  return <p>avatar</p>;
}

describe("RetryBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the cache and remounts after a failed load", () => {
    offline = true;
    const clear = vi.fn();
    render(<RetryBoundary clear={clear} retryDelaysMs={[100, 100]}><Model /></RetryBoundary>);
    expect(screen.queryByText("avatar")).toBeNull();
    act(() => void vi.advanceTimersByTime(100)); // first retry, still offline
    expect(screen.queryByText("avatar")).toBeNull();
    offline = false;
    act(() => void vi.advanceTimersByTime(100)); // second retry succeeds
    expect(screen.getByText("avatar")).toBeTruthy();
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last retry and renders the fallback", () => {
    offline = true;
    const onGiveUp = vi.fn();
    render(
      <RetryBoundary clear={() => {}} retryDelaysMs={[100]} onGiveUp={onGiveUp} fallback={<p>retry</p>}>
        <Model />
      </RetryBoundary>
    );
    act(() => void vi.advanceTimersByTime(100));
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(screen.getByText("retry")).toBeTruthy();
  });
});

describe("HeroBoundary", () => {
  it("keeps the page alive when the hero throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    offline = true;
    render(<HeroBoundary fallback={<p>placeholder</p>}><Model /></HeroBoundary>);
    expect(screen.getByText("placeholder")).toBeTruthy();
    vi.restoreAllMocks();
  });
});
