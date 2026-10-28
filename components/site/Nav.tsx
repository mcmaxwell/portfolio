"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { Magnetic } from "./Cursor";
import { SoundToggle } from "./SoundToggle";

const items = [
  { watch: "about", href: "#about", label: "About", index: "01" },
  { watch: "projects", href: "#projects", label: "Work", index: "02" },
  { watch: "experience", href: "#experience", label: "Career", index: "03" },
  { watch: "services", href: "#services", label: "Services", index: "04" },
  { watch: "contact", href: "#contact", label: "Contact", index: "05" },
];

/**
 * Fixed top header: wordmark, section links with scroll-spy, a scroll progress hairline and a
 * full-screen menu on small screens. The play transition hides it through [data-site-header]
 * (globals.css), the same way it hid the old side dots.
 */
export function Nav() {
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  // Scroll-spy: the last section whose top has crossed the 40% line. Measured at most once per
  // frame, since scroll events can fire several times a frame and each measurement forces layout.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      let current: string | null = null;
      for (const it of items) {
        const el = document.getElementById(it.watch);
        if (el && el.getBoundingClientRect().top <= line) current = it.watch;
      }
      setActive(current);
      setScrolled(window.scrollY > 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // The open menu: Escape closes it and returns focus, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    // Hides the memory particles, which would otherwise draw over the menu (globals.css).
    root.dataset.menu = "";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = prev;
      delete root.dataset.menu;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header
      data-site-header
      className={`fixed inset-x-0 top-0 ${open ? "z-50" : "z-40"} transition-[background-color,border-color] duration-300 ${
        scrolled && !open
          ? "border-b border-term-line/70 bg-term-bg/75 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 md:px-10">
        <a
          href="#top"
          className="group relative z-10 flex items-center gap-3 text-sm text-term-paper"
          onClick={() => setOpen(false)}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-full border border-term-accent/60 font-display text-xs font-bold text-term-accent transition-colors group-hover:bg-term-accent group-hover:text-term-bg"
          >
            ML
          </span>
          <span>
            maksym<span className="text-term-accent">.</span>liutsko
          </span>
        </a>

        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm">
            {items.map((it) => {
              const isActive = active === it.watch;
              return (
                <li key={it.href}>
                  <a
                    href={it.href}
                    aria-current={isActive ? "true" : undefined}
                    className={`group flex items-baseline gap-1.5 transition-colors ${
                      isActive ? "text-term-paper" : "text-term-muted hover:text-term-paper"
                    }`}
                  >
                    <span className={`text-[10px] ${isActive ? "text-term-accent" : ""}`}>{it.index}</span>
                    <span className="link-draw">{it.label}</span>
                  </a>
                </li>
              );
            })}
            <li>
              <SoundToggle />
            </li>
            <li>
              <Magnetic>
                <a
                  href="#contact"
                  className="flex items-center gap-2 rounded-full border border-term-accent/50 px-4 py-1.5 text-term-accent-bright transition-colors hover:bg-term-accent hover:text-term-bg"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-term-accent opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-term-accent" />
                  </span>
                  Available
                </a>
              </Magnetic>
            </li>
          </ul>
        </nav>

        <button
          ref={menuButton}
          type="button"
          className="relative z-10 flex h-10 items-center gap-3 text-sm text-term-paper md:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
          <span aria-hidden className="relative block h-3 w-6">
            <span
              className={`absolute left-0 top-0 h-px w-6 bg-current transition-transform duration-300 ${
                open ? "translate-y-1.5 rotate-45" : ""
              }`}
            />
            <span
              className={`absolute bottom-0 left-0 h-px w-6 bg-current transition-transform duration-300 ${
                open ? "-translate-y-1.5 -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>

      {/* Scroll progress */}
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-0 h-px w-full origin-left bg-term-accent"
        style={{ scaleX: progress }}
      />

      {/* Small-screen menu */}
      <div
        id="site-menu"
        hidden={!open}
        className="fixed inset-0 h-[100dvh] bg-term-bg px-5 pt-24 md:hidden"
      >
        <nav aria-label="Sections">
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={it.href} style={{ animationDelay: `${i * 60}ms` }} className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500">
                <a
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-baseline gap-4 border-b border-term-line py-4 font-display text-5xl font-medium text-term-paper"
                >
                  <span className="font-mono text-xs text-term-accent">{it.index}</span>
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
