"use client";

import { useEffect } from "react";

const AWAY_TITLE = "Still here when you're back · Maksym";
// The favicon's monogram with its ring filled in, shown while the tab is in the background.
const AWAY_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#ff5b26"/><path d="M15 42V22l8.5 13L32 22v20M38 22v20h11" fill="none" stroke="#0c0c0b" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  );

/** A small wink in the tab bar: while the page is in a background tab, its title and icon call you back. */
export function TabPresence() {
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"], link[rel="icon"]');
    const iconHref = icon?.href;
    let title = document.title;
    const onChange = () => {
      if (document.hidden) {
        title = document.title;
        document.title = AWAY_TITLE;
        if (icon) icon.href = AWAY_ICON;
      } else {
        document.title = title;
        if (icon && iconHref) icon.href = iconHref;
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return null;
}
