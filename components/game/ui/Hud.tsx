"use client";

// HUD pieces (design 2.10, play-transition.md 2.6). Staged fade-in during the entry: the buttons
// are keyboard-reachable from S + 1000 ms, before control is handed over, so the player is never
// trapped in the sequence. The "Energy cells" counter arrives with the challenge in M4.
import { EASE, TIMING } from "../shell/transition";

const stage = (shown: boolean, reduced: boolean, durationMs: number, hiddenShift: string) => ({
  opacity: shown ? 1 : 0,
  translate: shown || reduced ? "0px 0px" : hiddenShift,
  transition: reduced
    ? `opacity ${TIMING.reduced.fadeMs}ms ${EASE.out}`
    : `opacity ${durationMs}ms ${EASE.out}, translate ${durationMs}ms ${EASE.out}`,
});

export function HudButtons({
  shown,
  leaving,
  reduced,
  onPause,
  onExit,
}: {
  shown: boolean;
  leaving: boolean;
  reduced: boolean;
  onPause: () => void;
  onExit: () => void;
}) {
  const style = leaving
    ? { opacity: 0, translate: "0px 0px", transition: `opacity ${TIMING.exit.hudFadeMs}ms ${EASE.in}` }
    : stage(shown, reduced, TIMING.hud.buttonsEndMs - TIMING.hud.buttonsStartMs, "0px -8px");
  const live = shown && !leaving;
  return (
    <div
      className="pointer-events-auto absolute flex items-center gap-3 text-xs"
      style={{ left: "max(1rem, env(safe-area-inset-left))", top: "max(1rem, env(safe-area-inset-top))", ...style }}
      {...(live ? {} : ({ inert: "" } as Record<string, string>))}
    >
      <button
        onClick={onPause}
        className="min-h-[44px] border border-term-line bg-term-bg/80 px-4 py-2 text-term-muted backdrop-blur transition-colors hover:border-term-green hover:text-term-green-bright"
        style={{ touchAction: "manipulation" }}
      >
        [ pause ]
      </button>
      <button
        onClick={onExit}
        className="min-h-[44px] border border-term-green bg-term-bg/80 px-4 py-2 text-term-green-bright backdrop-blur transition-colors hover:bg-term-green hover:text-term-bg"
        style={{ touchAction: "manipulation" }}
      >
        [ exit ]
      </button>
    </div>
  );
}

export function ControlsHint({ shown, reduced }: { shown: boolean; reduced: boolean }) {
  return (
    <p
      className="pointer-events-none absolute bottom-6 left-0 right-0 hidden px-6 text-center text-xs text-term-muted md:block"
      style={{
        opacity: shown ? 1 : 0,
        transition: `opacity ${reduced ? TIMING.reduced.fadeMs : TIMING.hud.hintEndMs - TIMING.hud.hintStartMs}ms ${EASE.out}`,
      }}
    >
      WASD move · shift run · space jump · drag to look · R recenter · Esc pause
    </p>
  );
}
