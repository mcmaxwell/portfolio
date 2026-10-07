"use client";

import { useRef } from "react";
import { Dialog } from "../shell/Dialog";
import type { PauseReason } from "../session";

/** Resume and Exit to portfolio (Restart, Settings and Controls arrive with their features). */
export function PauseMenu({
  reason,
  onResume,
  onExit,
}: {
  reason: PauseReason | null;
  onResume: () => void;
  onExit: () => void;
}) {
  const resumeRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog labelledBy="pause-title" onClose={onResume} initialFocusRef={resumeRef}>
      <h2 id="pause-title" className="mb-1 text-base font-bold text-term-green-bright">
        Paused
      </h2>
      <p className="mb-5 text-xs text-term-muted">
        {reason === "hidden" || reason === "blur"
          ? "The game paused because the tab lost focus. It never resumes by itself."
          : "Press Escape or P to resume."}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          ref={resumeRef}
          onClick={onResume}
          className="border border-term-green bg-term-green/10 px-5 py-2 text-term-green-bright transition-colors hover:bg-term-green hover:text-term-bg"
        >
          [ resume ]
        </button>
        <button
          onClick={onExit}
          className="border border-term-line px-5 py-2 text-term-muted transition-colors hover:border-term-green hover:text-term-green-bright"
        >
          [ exit to portfolio ]
        </button>
      </div>
    </Dialog>
  );
}
