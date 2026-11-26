import { ask } from "@/lib/memory/ask";
import { logTurns, visitorMeta } from "@/lib/chatLog";

// "Ask my memory" (lib/memory/ask.ts). Node runtime for the in-memory limits and cache.
// Each question and its answer are saved to the private conversation log (lib/chatLog.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return ask(req, process.env.OPENAI_API_KEY, logTurns, visitorMeta(req));
}
