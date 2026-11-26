/**
 * Google Analytics 4 custom events (gtag is loaded in app/layout.tsx). Only counts and categories
 * go to GA: never what a visitor typed or said, since GA's terms forbid personal data and a free
 * text question can hold some. The text itself goes to the private conversation log (lib/chatLog.ts).
 */
export type EventParams = Record<string, string | number | boolean | undefined>;

type Gtag = (command: "event", name: string, params?: EventParams) => void;

export function track(name: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;
  try {
    gtag("event", name, params);
  } catch {
    // Analytics must never break the page.
  }
}
