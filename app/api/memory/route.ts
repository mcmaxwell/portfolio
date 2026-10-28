import { ask } from "@/lib/memory/ask";

// "Ask my memory" (lib/memory/ask.ts). Node runtime for the in-memory limits and cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return ask(req, process.env.OPENAI_API_KEY);
}
