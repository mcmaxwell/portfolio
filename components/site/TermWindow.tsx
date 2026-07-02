"use client";

import { motion } from "framer-motion";

/** A terminal-style window frame with a titlebar and traffic-light dots. */
export function TermWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`overflow-hidden border border-term-line bg-term-panel/70 backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-term-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-term-red/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-term-amber/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-term-green/70" />
        <span className="ml-3 text-xs text-term-muted">{title}</span>
      </div>
      <div className="p-6 md:p-10">{children}</div>
    </motion.div>
  );
}

/** Section wrapper: an id anchor + a `$ command` label above the window. */
export function TermSection({
  id,
  command,
  title,
  children,
}: {
  id: string;
  command: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title.replace(/^~\//, "").replace(/\.\w+$/, "")}
      className="mx-auto w-full max-w-5xl px-5 py-16 md:py-24"
    >
      <p className="mb-4 text-sm text-term-muted">
        <span className="text-term-green">maksym@portfolio</span>
        <span className="text-term-muted">:</span>
        <span className="text-term-cyan">~</span>
        <span className="text-term-muted">$ </span>
        <span className="text-term-fg">{command}</span>
      </p>
      <TermWindow title={title}>{children}</TermWindow>
    </section>
  );
}
