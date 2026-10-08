"use client";

import { useSyncExternalStore } from "react";
import type { SessionState, SessionStore } from "../session";

/** Reads the session store from React; the interface never reads positions or velocities. */
export function useSession(session: SessionStore): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
