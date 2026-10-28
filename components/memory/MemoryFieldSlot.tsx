"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MemoryField = dynamic(() => import("./MemoryField"), { ssr: false });

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Mounts the memory layer after the page's first idle moment, so its chunk and its data never
 * compete with the hero avatar's own load. It is invisible until the visitor scrolls anyway.
 */
export function MemoryFieldSlot() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setOn(true), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setOn(true), 1500);
    return () => window.clearTimeout(id);
  }, []);
  return on ? <MemoryField /> : null;
}
