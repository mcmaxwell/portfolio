"use client";

// HUD pieces (design 2.10, play-transition.md 2.6). Staged fade-in during the entry: the buttons
// are keyboard-reachable from S + 1000 ms, before control is handed over, so the player is never
// trapped in the sequence. The "Energy cells n/3" counter and the return-to-the-beacon guidance
// (M4) live in ChallengeHud.
import type { Interactable } from "../config";
import { CELL_IDS, allCollected, type ProgressV1 } from "../progress";
import { promptTarget } from "../content";
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
  blocked = false,
  reduced,
  onPause,
  onExit,
}: {
  shown: boolean;
  leaving: boolean;
  /** A panel is open: the buttons stay visible but are out of the tab order and the accessibility tree. */
  blocked?: boolean;
  reduced: boolean;
  onPause: () => void;
  onExit: () => void;
}) {
  const style = leaving
    ? { opacity: 0, translate: "0px 0px", transition: `opacity ${TIMING.exit.hudFadeMs}ms ${EASE.in}` }
    : stage(shown, reduced, TIMING.hud.buttonsEndMs - TIMING.hud.buttonsStartMs, "0px -8px");
  const live = shown && !leaving && !blocked;
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
      WASD move · shift run · space jump · drag to look · E interact · R recenter · Esc pause
    </p>
  );
}

/** The text of a prompt: the action, and the item it acts on where it has a name ("View project: XecSuite"). */
export function promptText(item: Interactable): string {
  const target = promptTarget(item.panel);
  return target ? `${item.prompt}: ${target}` : item.prompt;
}

/**
 * Interaction prompt: the key (E on a keyboard, the Interact button on touch) and the action. The
 * live region stays mounted so a screen reader announces each change; the visible chip is hidden
 * from it (the sentence in the region says the same).
 */
export function InteractionPrompt({ item, touch, hint = null }: { item: Interactable | null; touch: boolean; hint?: string | null }) {
  const text = item ? promptText(item) : "";
  return (
    <div
      className="pointer-events-none absolute bottom-24 left-0 right-0 flex justify-center px-4 md:bottom-16"
      data-interaction-prompt
      style={touch ? { bottom: "calc(13rem + env(safe-area-inset-bottom))" } : undefined}
    >
      <div role="status" aria-live="polite" className="sr-only">
        {item ? `${touch ? "Press the Interact button" : "Press E"} to ${text}` : (hint ?? "")}
      </div>
      {!item && hint && (
        <div aria-hidden="true" className="border border-term-line bg-term-bg/85 px-4 py-2 text-sm text-term-fg backdrop-blur" data-interaction-hint>
          {hint}
        </div>
      )}
      {item && (
        <div
          aria-hidden="true"
          className="flex items-center gap-3 border border-term-green bg-term-bg/85 px-4 py-2 text-sm text-term-fg backdrop-blur box-glow"
        >
          <kbd className="border border-term-green px-2 py-0.5 text-xs font-bold text-term-green-bright">{touch ? "Interact" : "E"}</kbd>
          <span>{text}</span>
        </div>
      )}
    </div>
  );
}

/** What the beacon says before it can be lit: how many cells are still missing. Not an action, so no key. */
export function beaconHintText(p: ProgressV1): string {
  const left = CELL_IDS.length - p.collected.length;
  return left === CELL_IDS.length ? `Collect ${left} energy cells to power the beacon` : `Collect ${left} more energy ${left === 1 ? "cell" : "cells"} to power the beacon`;
}

/** Text of the counter, e.g. "Energy cells 1/3". */
export const counterText = (p: ProgressV1): string => `Energy cells ${p.collected.length}/${CELL_IDS.length}`;
/** The guidance after the third cell (until the beacon is lit). */
export const GUIDANCE = "All three energy cells collected. Return to the glowing beacon in the plaza and press E.";
export const GUIDANCE_TOUCH = "All three energy cells collected. Return to the glowing beacon in the plaza and use Interact.";

/**
 * The challenge counter and the guidance. The counter is a polite live region, so each collected cell is
 * announced ("Energy cells 2/3"); the guidance is a second one that appears with the third cell. Both are
 * plain text on a dark chip (contrast above 4.5:1 on any background).
 */
export function ChallengeHud({
  progress,
  shown,
  leaving,
  touch,
  reduced,
}: {
  progress: ProgressV1;
  shown: boolean;
  leaving: boolean;
  touch: boolean;
  reduced: boolean;
}) {
  const ready = allCollected(progress) && !progress.completed;
  const transition = `opacity ${reduced ? TIMING.reduced.fadeMs : TIMING.hud.buttonsEndMs - TIMING.hud.buttonsStartMs}ms ${EASE.out}`;
  return (
    <div
      className="pointer-events-none absolute flex max-w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-3"
      style={{ top: "max(1rem, env(safe-area-inset-top))", right: "max(1rem, env(safe-area-inset-right))", opacity: shown && !leaving ? 1 : 0, transition }}
      data-challenge-hud
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`flex min-h-[44px] items-center border bg-term-bg/85 px-4 py-2 text-xs backdrop-blur ${progress.completed ? "border-term-cyan text-term-cyan" : "border-term-green text-term-green-bright"}`}
        data-energy-counter
      >
        {counterText(progress)}
      </div>
      {progress.trophy && (
        // The sentence is announced by the game's own live region when the cup is collected; this chip only keeps it on screen.
        <div
          aria-hidden="true"
          className="flex min-h-[44px] items-center border border-term-cyan bg-term-bg/85 px-4 py-2 text-xs text-term-cyan backdrop-blur"
          data-trophy-chip
        >
          Trophy collected
        </div>
      )}
      <p
        role="status"
        aria-live="polite"
        className={ready ? "border border-term-cyan bg-term-bg/85 px-4 py-2 text-xs leading-relaxed text-term-fg backdrop-blur box-glow" : "sr-only"}
        data-challenge-guidance
      >
        {ready ? (touch ? GUIDANCE_TOUCH : GUIDANCE) : ""}
      </p>
    </div>
  );
}
