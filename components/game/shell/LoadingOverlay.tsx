"use client";

// Non-blocking loading strip with Cancel (play-transition.md 3) and the failure dialog
// (design 3.5). Both are shell code: they render before any game chunk exists.
import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { EASE, TIMING } from "./transition";

/**
 * One line of text, a 2 px progress line and Cancel, at the bottom centre where the title was.
 * `visible` false fades it out; the parent unmounts it afterwards.
 */
export function LoadingStrip({
  progress,
  visible,
  reduced,
  onCancel,
}: {
  progress: number; // 0..1
  visible: boolean;
  reduced: boolean;
  onCancel: () => void;
}) {
  const [entered, setEntered] = useState(false);
  const [announced, setAnnounced] = useState(Math.round(progress * 100));
  const latest = useRef(progress);
  latest.current = progress;
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Fade in on the next frame after mount.
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  // The percentage text (a polite status) changes at most every 500 ms.
  useEffect(() => {
    const id = setInterval(() => setAnnounced(Math.round(latest.current * 100)), 500);
    return () => clearInterval(id);
  }, []);

  // Cancel takes focus when the strip appears (focus was on the disabled Play button). A strip that
  // mounts already fading out is not offered to the user and must never take focus.
  useEffect(() => {
    if (visible) cancelRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, []);

  const shown = visible && entered;
  const fadeMs = reduced
    ? TIMING.reduced.stripFadeMs
    : visible
    ? TIMING.stripFadeInMs
    : TIMING.stripFadeOutMs;
  return (
    <div
      data-xfade-fast
      className="fixed bottom-10 left-0 right-0 z-[55] flex flex-col items-center gap-3 px-6 text-center"
      style={{
        opacity: shown ? 1 : 0,
        transition: `opacity ${fadeMs}ms ${visible ? EASE.out : EASE.in}`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <p role="status" className="text-xs text-term-muted">
        loading world... {announced}%
      </p>
      <div className="h-0.5 w-56 bg-term-line" aria-hidden="true">
        <div
          className="h-full bg-term-green"
          style={{ width: `${Math.round(progress * 100)}%`, transition: reduced ? "none" : "width 150ms linear" }}
        />
      </div>
      <button
        ref={cancelRef}
        onClick={onCancel}
        className="border border-term-line bg-term-bg/80 px-5 py-2 text-xs text-term-muted transition-colors hover:border-term-green hover:text-term-green-bright"
      >
        [ cancel ]
      </button>
    </div>
  );
}

/** Retry and Back to portfolio; Escape means Back. */
export function FailureDialog({
  title,
  message,
  onRetry,
  onBack,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const retryRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog labelledBy="game-failure-title" onClose={onBack} initialFocusRef={retryRef}>
      <h2 id="game-failure-title" className="mb-2 text-base font-bold text-term-red">
        {title}
      </h2>
      <p role="alert" className="mb-5 text-term-muted">
        {message}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          ref={retryRef}
          onClick={onRetry}
          className="border border-term-green bg-term-green/10 px-5 py-2 text-term-green-bright transition-colors hover:bg-term-green hover:text-term-bg"
        >
          [ retry ]
        </button>
        <button
          onClick={onBack}
          className="border border-term-line px-5 py-2 text-term-muted transition-colors hover:border-term-green hover:text-term-green-bright"
        >
          [ back to portfolio ]
        </button>
      </div>
    </Dialog>
  );
}
