"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ComponentProps } from "react";

/**
 * Moving between the site's pages without a reload: a client-side navigation wrapped in a
 * same-document view transition, so the project card's picture and title still morph into the case
 * page (the names come from `vt()` in CaseStudy.tsx). Where view transitions are missing, or with
 * reduced motion, it is a plain Next link: still no reload, just no morph. A new tab, a modified
 * click or a link to the same page behave as usual.
 */

let settle: (() => void) | null = null;

/** Mounted once in the root layout: ends the running transition when the new route has rendered. */
export function RouteSettled() {
  const pathname = usePathname();
  useEffect(() => {
    // Right away: rendering is paused while a transition waits for its update, so a frame
    // callback here would never run. The effect runs after the new page is committed.
    const done = settle;
    settle = null;
    done?.();
  }, [pathname]);
  return null;
}

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void>) => ViewTransition };

export function TransitionLink({ href, onClick, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
        const doc = document as ViewTransitionDocument;
        if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (new URL(href, window.location.href).pathname === window.location.pathname) return;
        e.preventDefault();
        const t = doc.startViewTransition(
          () =>
            new Promise<void>((resolve) => {
              settle = resolve;
              // Never hold the old page on screen if the route is slow to render.
              window.setTimeout(() => {
                if (settle === resolve) {
                  settle = null;
                  resolve();
                }
              }, 2500);
              router.push(href);
            })
        );
        // A skipped or aborted animation (another click, a tab switch) still navigates; keep it quiet.
        t.ready.catch(() => {});
        t.finished.catch(() => {});
      }}
    />
  );
}
