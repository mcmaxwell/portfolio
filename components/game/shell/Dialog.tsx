"use client";

// Hand-written modal dialog (design 2.10 and 6): focus moves in on open, Tab cycles inside,
// Escape asks to close, and focus returns to the element that had it before opening.
// It lives in shell/ because the failure dialog has to work before any game code has loaded.
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true"
  );
}

export function Dialog({
  labelledBy,
  onClose,
  children,
  initialFocusRef,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = rootRef.current;
    if (root) {
      const target = initialFocusRef?.current ?? focusablesIn(root)[0] ?? root;
      target.focus({ preventScroll: true });
    }
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
    // Focus handling runs once per open; the ref object is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // the game's own Escape handler must not also toggle pause
      closeRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const root = rootRef.current;
    if (!root) return;
    const items = focusablesIn(root);
    if (items.length === 0) {
      e.preventDefault();
      root.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-term-bg/70 px-4 outline-none backdrop-blur-sm"
    >
      <div className="w-full max-w-sm border border-term-green bg-term-panel p-6 text-sm text-term-fg box-glow">{children}</div>
    </div>
  );
}
