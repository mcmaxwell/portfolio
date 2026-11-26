import type { Channel, Role } from "./chatLog";

/** A random id for one conversation. No cookie, nothing that links two visits. */
export function newChatId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** One id per tab for "Ask my memory", so several questions read as one conversation. */
export function tabChatId(): string {
  try {
    const saved = sessionStorage.getItem("ml-chat");
    if (saved) return saved;
    const id = newChatId();
    sessionStorage.setItem("ml-chat", id);
    return id;
  } catch {
    return newChatId();
  }
}

export type ClientTurn = { role: Role; text: string; at?: number };

/** Sends voice turns to the log (app/api/chat-log). Fire and forget; keepalive survives a tab close. */
export function sendTurns(id: string, channel: Channel, turns: ClientTurn[], extra: { referrer?: string } = {}): void {
  if (!turns.length || typeof fetch === "undefined") return;
  try {
    void fetch("/api/chat-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, channel, turns: turns.map((t) => ({ ...t, at: t.at ?? Date.now() })), ...extra }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Logging must never break the chat.
  }
}

/** Where the visitor came from, as a host name only (no path or query that could hold personal data). */
export function referrerHost(): string | undefined {
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    return host && host !== location.hostname ? host : undefined;
  } catch {
    return undefined;
  }
}
