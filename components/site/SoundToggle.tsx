"use client";

import { useEffect, useState } from "react";
import { onSoundChange, restoreSound, setSound, wireSound } from "@/lib/sound";

/** "Sound on / off": four bars that dance while it is on (still with reduced motion). */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    wireSound();
    setOn(restoreSound());
    return onSoundChange(setOn);
  }, []);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setSound(!on)}
      className={`group inline-flex items-center gap-2 text-xs text-term-muted transition-colors hover:text-term-paper ${className}`}
    >
      <span aria-hidden className="flex h-3 items-end gap-[2px]">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[2px] rounded-full bg-current ${on ? "animate-sound-bar motion-reduce:animate-none" : ""}`}
            style={{ height: on ? undefined : "3px", animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </span>
      Sound {on ? "on" : "off"}
    </button>
  );
}
