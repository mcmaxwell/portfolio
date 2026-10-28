"use client";

import { useCallback, useEffect, useState } from "react";
import { LENSES, type Lens } from "./lenses";

const KEY = "memory-lens";
const EVENT = "memory-lens";

const read = (): Lens | null => {
  try {
    const v = window.localStorage.getItem(KEY);
    return (LENSES as readonly string[]).includes(v ?? "") ? (v as Lens) : null;
  } catch {
    return null;
  }
};

/** The current lens; `chosen` is false until the visitor picks one (the default is "founder"). */
export function useLens() {
  const [lens, setLensState] = useState<Lens>("founder");
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    const saved = read();
    if (saved) {
      setLensState(saved);
      setChosen(true);
    }
    const on = (e: Event) => {
      setLensState((e as CustomEvent<Lens>).detail);
      setChosen(true);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const setLens = useCallback((l: Lens) => {
    try {
      window.localStorage.setItem(KEY, l);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    window.dispatchEvent(new CustomEvent<Lens>(EVENT, { detail: l }));
  }, []);
  return { lens, chosen, setLens };
}
