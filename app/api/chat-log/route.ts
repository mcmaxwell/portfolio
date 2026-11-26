import { cleanTurns, isChannel, isChatId, logTurns, visitorMeta } from "@/lib/chatLog";

// Receives the voice chat's transcript turns from the browser (the voice runs browser to OpenAI
// directly, so the server never sees it otherwise). "Ask my memory" logs on the server instead.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60_000;
const PER_VISITOR = 120;
const posts = new Map<string, number[]>();

function allow(visitor: string, now = Date.now()): boolean {
  const recent = (posts.get(visitor) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_VISITOR) return false;
  recent.push(now);
  posts.set(visitor, recent);
  if (posts.size > 5000) posts.clear();
  return true;
}

export async function POST(req: Request) {
  const visitor = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  if (!allow(visitor)) return new Response(null, { status: 429 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const { id, channel, turns: raw, referrer } = body;
  if (!isChatId(id) || channel !== "voice" || !isChannel(channel)) return new Response(null, { status: 400 });
  const turns = cleanTurns(raw);
  if (!turns.length) return new Response(null, { status: 400 });

  await logTurns(
    {
      id,
      channel,
      startedAt: turns[0].at,
      ...visitorMeta(req),
      referrer: typeof referrer === "string" && /^[a-z0-9.-]{1,100}$/i.test(referrer) ? referrer : undefined,
    },
    turns
  );
  return new Response(null, { status: 204 });
}
