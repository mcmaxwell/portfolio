import { buildCorpus, memoryText, type Memory } from "@/lib/memory/corpus";
import { topK } from "@/lib/memory/search";
import { LENSES, type Lens } from "@/lib/memory/lenses";
import { owner } from "@/lib/persona";

/**
 * "Ask my memory" (served by app/api/memory/route.ts): embeds the visitor's question, finds the
 * closest passages of the site's own content and writes a short answer from them alone. The passages are embedded once per server
 * instance and kept in memory; each question costs one small embedding and one short completion,
 * and a per-visitor limit keeps the bill bounded.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const ANSWER_MODEL = "gpt-4o-mini";
const TOP_K = 4;
const MAX_QUESTION = 200;
export const RATE = { perVisitor: 12, windowMs: 10 * 60_000, perInstanceDaily: 800 };

const corpus: Memory[] = buildCorpus();
const byId = new Map(corpus.map((m) => [m.id, m]));
let corpusVectors: Promise<number[][]> | null = null;

const hits = new Map<string, number[]>();
let day = { start: Date.now(), count: 0 };

/** Sliding window per visitor plus a daily ceiling per instance. */
export function allow(visitor: string, now = Date.now()): boolean {
  if (now - day.start > 86_400_000) day = { start: now, count: 0 };
  if (day.count >= RATE.perInstanceDaily) return false;
  const recent = (hits.get(visitor) ?? []).filter((t) => now - t < RATE.windowMs);
  if (recent.length >= RATE.perVisitor) {
    hits.set(visitor, recent);
    return false;
  }
  recent.push(now);
  hits.set(visitor, recent);
  day.count++;
  if (hits.size > 5000) hits.clear();
  return true;
}

export function resetLimits() {
  hits.clear();
  day = { start: Date.now(), count: 0 };
  corpusVectors = null;
}

async function openai<T>(path: string, body: unknown, apiKey: string): Promise<T> {
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

type Embeddings = { data: { index: number; embedding: number[] }[] };
const embed = async (input: string[], apiKey: string) =>
  (await openai<Embeddings>("embeddings", { model: EMBEDDING_MODEL, input }, apiKey)).data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);

const LENS_FRAMING: Record<Lens, string> = {
  founder: "The reader runs a business: say what it means for them in plain words, no jargon.",
  recruiter: "The reader is hiring: lead with role, years, scope and the stack.",
  engineer: "The reader is an engineer: be specific about architecture, models and tools.",
};

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export async function ask(req: Request, apiKey: string | undefined): Promise<Response> {
  if (!apiKey) return json({ error: "unavailable", fallback: true }, 503);

  let q = "";
  let lens: Lens = "founder";
  try {
    const body = (await req.json()) as { q?: unknown; lens?: unknown };
    q = typeof body.q === "string" ? body.q.trim() : "";
    if (typeof body.lens === "string" && (LENSES as readonly string[]).includes(body.lens)) lens = body.lens as Lens;
  } catch {
    // Treated as an empty question below.
  }
  if (q.length < 2 || q.length > MAX_QUESTION) {
    return json({ error: `Ask in 2 to ${MAX_QUESTION} characters.` }, 400);
  }

  const visitor = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  if (!allow(visitor)) {
    return json({ error: "rate_limited", fallback: true }, 429, { "Retry-After": "600" });
  }

  try {
    const t0 = Date.now();
    if (!corpusVectors) {
      corpusVectors = embed(corpus.map(memoryText), apiKey);
      corpusVectors.catch(() => (corpusVectors = null));
    }
    const [vectors, [query]] = await Promise.all([corpusVectors, embed([q], apiKey)]);
    const t1 = Date.now();
    const matches = topK(query, vectors, corpus.map((m) => m.id), TOP_K).map((m) => ({ ...m, score: Math.round(m.score * 1000) / 1000 }));
    const t2 = Date.now();

    const context = matches.map((m, i) => `[${i + 1}] ${memoryText(byId.get(m.id)!)}`).join("\n");
    type Chat = { choices: { message: { content: string } }[] };
    const chat = await openai<Chat>(
      "chat/completions",
      {
        model: ANSWER_MODEL,
        max_tokens: 160,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You answer questions about ${owner.name} on his portfolio site, in the first person as him, in at most three short sentences. ` +
              `Use only the numbered memories; if they do not answer the question, say so and suggest emailing ${owner.email}. ` +
              `Never invent clients, numbers or dates. ${LENS_FRAMING[lens]}`,
          },
          { role: "user", content: `Memories:\n${context}\n\nQuestion: ${q}` },
        ],
      },
      apiKey
    );
    const answer = chat.choices[0]?.message.content.trim() ?? "";
    return json({
      mode: "semantic",
      model: { embedding: EMBEDDING_MODEL, answer: ANSWER_MODEL },
      corpusSize: corpus.length,
      matches,
      answer,
      timings: { embedMs: t1 - t0, searchMs: t2 - t1, answerMs: Date.now() - t2 },
    });
  } catch {
    return json({ error: "upstream", fallback: true }, 502);
  }
}
