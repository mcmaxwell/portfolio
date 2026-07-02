"use client";

import { useEffect, useState } from "react";

// Example prompts the visitor can say once connected — cycled with a
// letter-by-letter typewriter effect.
const EXAMPLES = [
  "ask about my experience",
  "what's your tech stack?",
  "show me your projects",
  "take me to contact",
  "tell me to wave",
  "make it dance",
];

export function AskHints() {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const full = EXAMPLES[index];
    let delay = deleting ? 30 : 60;

    if (!deleting && text === full) {
      delay = 1800; // pause when fully typed
    } else if (deleting && text === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % EXAMPLES.length);
      return;
    }

    const timer = setTimeout(() => {
      if (deleting) {
        setText(full.slice(0, text.length - 1));
      } else if (text === full) {
        setDeleting(true);
      } else {
        setText(full.slice(0, text.length + 1));
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [text, deleting, index]);

  return (
    <div className="pointer-events-none absolute right-5 top-20 z-20 hidden max-w-[280px] flex-col items-end border border-term-line bg-term-bg/70 px-3 py-2 text-right text-xs backdrop-blur sm:flex">
      <span className="mb-1 text-[10px] uppercase tracking-widest text-term-muted">
        try asking
      </span>
      <span className="text-term-fg">
        <span className="text-term-green">&gt; </span>
        {text}
        <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-term-green animate-blink" />
      </span>
    </div>
  );
}
