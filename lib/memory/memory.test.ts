// "Ask my memory": the corpus it searches, both rankings, and the server handler with OpenAI mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCorpus, memoryText } from "./corpus";
import { buildLexicalIndex, cosine, lexicalSearch, tokenize, topK } from "./search";
import { RATE, allow, ask, resetLimits } from "./ask";
import { cases } from "@/data/cases";
import { owner } from "@/lib/persona";

describe("corpus", () => {
  const corpus = buildCorpus();

  it("covers every case, role and service with unique ids and a link", () => {
    const ids = new Set(corpus.map((m) => m.id));
    expect(ids.size).toBe(corpus.length);
    for (const c of cases) expect(ids.has(`case-${c.slug}`)).toBe(true);
    expect(corpus.some((m) => m.kind === "role")).toBe(true);
    expect(corpus.filter((m) => m.kind === "service").length).toBe(7);
    for (const m of corpus) expect(m.href).toMatch(/^\/(work\/|#)/);
  });

  it("keeps passages short and leaves the phone number out", () => {
    for (const m of corpus) {
      expect(memoryText(m).length).toBeLessThan(1200);
      expect(memoryText(m)).not.toContain(owner.phone);
    }
  });
});

describe("search", () => {
  const corpus = buildCorpus();
  const index = buildLexicalIndex(corpus);

  it("ranks by cosine and keeps the best k", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    const m = topK([1, 0], [[0, 1], [1, 0.1], [1, 1]], ["a", "b", "c"], 2);
    expect(m.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("tokenizes without stop words and folds plurals", () => {
    expect(tokenize("What are your Magento stores?")).toEqual(["magento", "store"]);
    expect(tokenize("Next.js and GPT-4o")).toEqual(["next.js", "next", "js", "gpt", "4o"]);
    expect(tokenize("NewsStocks.live")).toContain(tokenize("NewsStocks")[0]);
  });

  it("finds the e-commerce case for a checkout question and NewsStocks for videos", () => {
    const shop = lexicalSearch(index, "Magento checkout clients", 4);
    expect(shop.slice(0, 3).some((m) => m.id.startsWith("case-ecommerce"))).toBe(true);
    const news = lexicalSearch(index, "daily videos TikTok", 4);
    expect(news[0].score).toBe(1);
    expect(news.map((m) => m.id).some((id) => id.startsWith("case-newsstocks"))).toBe(true);
    expect(lexicalSearch(index, "How does the NewsStocks pipeline work?", 4)[0].id).toMatch(/^case-newsstocks/);
    expect(lexicalSearch(index, "zzzz qqqq", 4)).toEqual([]);
  });
});

describe("ask handler", () => {
  const vec = (i: number, n: number) => Array.from({ length: n }, (_, k) => (k === i ? 1 : 0.01));
  const corpusSize = buildCorpus().length;
  let calls: { url: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    resetLimits();
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push({ url, body });
        if (url.endsWith("/embeddings")) {
          const input = body.input as string[];
          // The question lands on passage 3; every passage on its own axis.
          const data = input.length === 1 ? [{ index: 0, embedding: vec(3, corpusSize) }] : input.map((_, i) => ({ index: i, embedding: vec(i, corpusSize) }));
          return new Response(JSON.stringify({ data }), { status: 200 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: " I built it. " } }] }), { status: 200 });
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const req = (body: unknown, ip = "1.1.1.1") =>
    new Request("http://x/api/memory", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) });

  it("answers from the closest passages and reports how", async () => {
    const res = await ask(req({ q: "What is XecSuite?", lens: "engineer" }), "sk-test");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe("semantic");
    expect(data.corpusSize).toBe(corpusSize);
    expect(data.matches).toHaveLength(4);
    expect(data.matches[0].id).toBe(buildCorpus()[3].id);
    expect(data.answer).toBe("I built it.");
    const chat = calls.find((c) => c.url.endsWith("/chat/completions"))!;
    const system = (chat.body.messages as { content: string }[])[0].content;
    expect(system).toContain("Use only the numbered memories");
    expect(system).toContain("engineer");
    // The corpus is embedded once per instance, not per question.
    await ask(req({ q: "And NewsStocks?" }), "sk-test");
    expect(calls.filter((c) => c.url.endsWith("/embeddings") && (c.body.input as string[]).length > 1)).toHaveLength(1);
  });

  it("refuses without a key, with a bad question, and past the visitor's limit", async () => {
    expect((await ask(req({ q: "hi there" }), undefined)).status).toBe(503);
    expect((await ask(req({ q: "x" }), "sk")).status).toBe(400);
    expect((await ask(req({ q: "y".repeat(201) }), "sk")).status).toBe(400);
    for (let i = 0; i < RATE.perVisitor; i++) expect(allow("9.9.9.9")).toBe(true);
    const limited = await ask(req({ q: "one more" }, "9.9.9.9"), "sk");
    expect(limited.status).toBe(429);
    expect((await limited.json()).fallback).toBe(true);
    expect(allow("9.9.9.9", Date.now() + RATE.windowMs + 1)).toBe(true);
  });

  it("falls back when OpenAI fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const res = await ask(req({ q: "What is XecSuite?" }), "sk-test");
    expect(res.status).toBe(502);
    expect((await res.json()).fallback).toBe(true);
  });
});
