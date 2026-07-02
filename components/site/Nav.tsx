"use client";

import { useEffect, useState } from "react";

const items = [
  { watch: "talk", href: "#top", label: "home" },
  { watch: "about", href: "#about", label: "about" },
  { watch: "projects", href: "#projects", label: "projects" },
  { watch: "experience", href: "#experience", label: "experience" },
  { watch: "contact", href: "#contact", label: "contact" },
];

export function Nav() {
  const [active, setActive] = useState("talk");

  // Scroll-spy: pick the last section whose top has crossed the 40% line.
  // Re-queries elements on each scroll, so the dynamically-mounted hero
  // (#talk) is found and "home" activates at the top.
  useEffect(() => {
    const onScroll = () => {
      const line = window.innerHeight * 0.4;
      let current = items[0].watch;
      for (const it of items) {
        const el = document.getElementById(it.watch);
        if (el && el.getBoundingClientRect().top <= line) current = it.watch;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // Re-evaluate when layout changes (e.g. the dynamic hero mounts and grows
    // the page), so "home" activates at the top.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  return (
    <nav className="fixed right-5 top-1/2 z-40 flex -translate-y-1/2 flex-col items-end gap-4">
      {items.map((it) => {
        const isActive = active === it.watch;
        return (
          <a
            key={it.href}
            href={it.href}
            aria-label={it.label}
            className="group relative flex items-center justify-end"
          >
            {/* info bubble */}
            <span className="pointer-events-none absolute right-6 whitespace-nowrap border border-term-line bg-term-bg/90 px-2 py-1 text-xs text-term-fg opacity-0 backdrop-blur-sm transition-all duration-150 -translate-x-1 group-hover:translate-x-0 group-hover:opacity-100">
              <span className="text-term-green">./</span>
              {it.label}
            </span>
            {/* dot */}
            <span
              className={`h-2.5 w-2.5 rounded-full border transition-all duration-200 ${
                isActive
                  ? "border-term-green bg-term-green box-glow"
                  : "border-term-muted bg-transparent group-hover:border-term-green group-hover:scale-125"
              }`}
            />
          </a>
        );
      })}
    </nav>
  );
}
