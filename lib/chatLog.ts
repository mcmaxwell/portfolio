/**
 * Conversation log for the avatar (voice) and "Ask my memory" (text), so Max can read what visitors
 * actually ask. Stored in Upstash Redis over its REST API (no SDK): set KV_REST_API_URL and
 * KV_REST_API_TOKEN (the names the Vercel Upstash integration creates) or UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN. Without them the log falls back to one line per turn in the server log.
 *
 * Privacy: no IP address, no user agent string, no name or email field. A conversation is a random
 * id made in the visitor's browser, plus the country Vercel resolves, a phone/desktop flag and the
 * turns themselves. Everything expires after RETENTION_DAYS.
 */

export type Channel = "voice" | "memory";
export type Role = "visitor" | "avatar" | "action";
export type Turn = { role: Role; text: string; at: number };
export type ChatMeta = {
  id: string;
  channel: Channel;
  startedAt: number;
  country?: string;
  device?: "phone" | "desktop";
  lens?: string;
  referrer?: string;
};
export type Conversation = ChatMeta & { lastAt: number; turns: Turn[] };

export const RETENTION_DAYS = 90;
const TTL_S = RETENTION_DAYS * 86_400;
export const LIMITS = { text: 2000, turnsPerPost: 10, turnsPerChat: 300 };
const INDEX = "chats";
const ROLES: readonly Role[] = ["visitor", "avatar", "action"];
const CHANNELS: readonly Channel[] = ["voice", "memory"];

const metaKey = (id: string) => `chat:${id}:meta`;
const turnsKey = (id: string) => `chat:${id}:turns`;

export const isChatId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);
export const isChannel = (v: unknown): v is Channel => typeof v === "string" && (CHANNELS as readonly string[]).includes(v);

function store(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const logStoreConfigured = () => store() !== null;

type Cmd = (string | number)[];

async function pipeline(cmds: Cmd[], timeoutMs = 2500): Promise<unknown[]> {
  const s = store();
  if (!s) throw new Error("chat log store is not configured");
  const res = await fetch(`${s.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`chat log store ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((r) => r.result);
}

/** Cleans what a browser sent: known roles only, trimmed text with a length cap, a sane timestamp. */
export function cleanTurns(raw: unknown, now = Date.now()): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns: Turn[] = [];
  for (const t of raw.slice(0, LIMITS.turnsPerPost)) {
    if (!t || typeof t !== "object") continue;
    const { role, text, at } = t as Record<string, unknown>;
    if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) continue;
    if (typeof text !== "string") continue;
    const clean = text.replace(/\s+/g, " ").trim().slice(0, LIMITS.text);
    if (!clean) continue;
    // The browser's clock orders a voice turn by when it was spoken (the transcript of a question
    // can arrive after the answer started). Anything far off falls back to the server's clock.
    const ok = typeof at === "number" && at > now - 6 * 3_600_000 && at < now + 60_000;
    turns.push({ role: role as Role, text: clean, at: ok ? Math.round(at) : now });
  }
  return turns;
}

/** Country and a phone/desktop flag from the request headers; nothing else about the visitor. */
export function visitorMeta(req: Request): Pick<ChatMeta, "country" | "device"> {
  const country = req.headers.get("x-vercel-ip-country") ?? undefined;
  const ua = req.headers.get("user-agent") ?? "";
  return {
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    device: /Mobi|Android|iPhone|iPad/i.test(ua) ? "phone" : "desktop",
  };
}

/** Appends turns to a conversation, creating it on first write. Never throws. */
export async function logTurns(meta: ChatMeta, turns: Turn[]): Promise<boolean> {
  if (!turns.length) return false;
  if (!store()) {
    for (const t of turns) console.info(`[chat] ${meta.channel} ${meta.id} ${t.role}: ${t.text}`);
    return false;
  }
  const now = Date.now();
  const cmds: Cmd[] = [
    ["SET", metaKey(meta.id), JSON.stringify(meta), "EX", TTL_S, "NX"],
    ["EXPIRE", metaKey(meta.id), TTL_S],
    ["RPUSH", turnsKey(meta.id), ...turns.map((t) => JSON.stringify(t))],
    ["LTRIM", turnsKey(meta.id), -LIMITS.turnsPerChat, -1],
    ["EXPIRE", turnsKey(meta.id), TTL_S],
    ["ZADD", INDEX, now, meta.id],
    ["ZREMRANGEBYSCORE", INDEX, "-inf", now - TTL_S * 1000],
  ];
  try {
    await pipeline(cmds);
    return true;
  } catch (err) {
    console.error("[chat] could not save turns", err instanceof Error ? err.message : err);
    return false;
  }
}

const parse = <T,>(s: unknown): T | null => {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

/** The newest conversations first, a page at a time. */
export async function readConversations(page = 0, perPage = 30): Promise<{ total: number; items: Conversation[] }> {
  const start = page * perPage;
  const [ids, total] = (await pipeline([
    ["ZRANGE", INDEX, start, start + perPage - 1, "REV", "WITHSCORES"],
    ["ZCARD", INDEX],
  ])) as [string[] | null, number | null];
  const pairs: [string, number][] = [];
  for (let i = 0; ids && i < ids.length; i += 2) pairs.push([ids[i], Number(ids[i + 1])]);
  if (!pairs.length) return { total: total ?? 0, items: [] };

  const rows = await pipeline(pairs.flatMap(([id]) => [["GET", metaKey(id)], ["LRANGE", turnsKey(id), 0, -1]] as Cmd[]));
  const items: Conversation[] = [];
  pairs.forEach(([id, lastAt], i) => {
    const meta = parse<ChatMeta>(rows[i * 2]);
    const turns = ((rows[i * 2 + 1] as string[] | null) ?? [])
      .map((t) => parse<Turn>(t))
      .filter((t): t is Turn => t !== null)
      .sort((a, b) => a.at - b.at);
    if (!meta && !turns.length) return; // expired between the two reads
    items.push({ ...(meta ?? { id, channel: "voice", startedAt: turns[0]?.at ?? lastAt }), id, lastAt, turns });
  });
  return { total: total ?? items.length, items };
}
