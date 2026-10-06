"use client";

import { useEffect, useRef } from "react";

/**
 * Renders nothing. Placed after the hero avatar inside the same Suspense boundary, so
 * it mounts only once the avatar has loaded, without editing Avatar.tsx.
 */
export function ReadySignal({ onReady }: { onReady: () => void }) {
  const ref = useRef(onReady);
  ref.current = onReady;
  useEffect(() => ref.current(), []);
  return null;
}
