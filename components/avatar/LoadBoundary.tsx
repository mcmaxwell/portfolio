"use client";

import { Component, type ReactNode } from "react";

// A failed fetch or decode inside the canvas (useGLTF throws it during render) used to bubble out of
// <Canvas> and unmount the whole page ("Application error"). These boundaries keep it local.

type RetryProps = {
  /** Drops the failed load from the loader cache, so the next mount fetches again. */
  clear: () => void;
  /** Delays before each retry; once they are used up, `fallback` renders and `onGiveUp` fires. */
  retryDelaysMs: readonly number[];
  onGiveUp?: (error: Error) => void;
  fallback?: ReactNode;
  children: ReactNode;
};

type RetryState = { failed: boolean; attempt: number; gaveUp: boolean };

/** Catches a failed load, then remounts its children after a delay (a fresh fetch) a few times. */
export class RetryBoundary extends Component<RetryProps, RetryState> {
  state: RetryState = { failed: false, attempt: 0, gaveUp: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError(): Partial<RetryState> {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.clear();
    const delay = this.props.retryDelaysMs[this.state.attempt];
    if (delay === undefined) {
      this.setState({ gaveUp: true });
      this.props.onGiveUp?.(error);
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 })),
      delay
    );
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  render() {
    if (this.state.gaveUp) return this.props.fallback ?? null;
    return this.state.failed ? null : this.props.children;
  }
}

/** Last line of defence for the hero: whatever throws in it, the rest of the portfolio still renders. */
export class HeroBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("hero failed, showing the static fallback", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
