/**
 * The two ways "ask my memory" ranks passages: by meaning (cosine over embeddings, on the server)
 * and by words (BM25, in the browser, for when the server is unavailable or the visitor is offline).
 */
import { memoryText, type Memory } from "./corpus";

export type Match = { id: string; score: number };

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function topK(query: readonly number[], vectors: readonly (readonly number[])[], ids: readonly string[], k: number): Match[] {
  return vectors
    .map((v, i) => ({ id: ids[i], score: cosine(query, v) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}

const STOP = new Set(
  "a an and are as at be by can do does for from has have how i in is it me my of on or so that the this to was what when where which who why will with you your".split(" ")
);

const fold = (w: string) =>
  w.length > 5 && w.endsWith("ing") ? w.slice(0, -3) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;

/**
 * Lower-case words, stop words dropped, plural and -ing endings folded. A dotted name keeps its
 * whole spelling and also yields its parts, so "NewsStocks.live" matches "NewsStocks".
 */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []) {
    const w = raw.replace(/^\.+|\.+$/g, "");
    if (w.length < 2 || STOP.has(w)) continue;
    if (!w.includes(".")) {
      out.push(fold(w));
      continue;
    }
    out.push(w);
    for (const part of w.split(".")) if (part.length > 1 && !STOP.has(part)) out.push(fold(part));
  }
  return out;
}

export type LexicalIndex = { docs: { id: string; tf: Map<string, number>; len: number }[]; df: Map<string, number>; avg: number };

export function buildLexicalIndex(corpus: readonly Memory[]): LexicalIndex {
  const df = new Map<string, number>();
  const docs = corpus.map((m) => {
    const tokens = tokenize(memoryText(m));
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of Array.from(tf.keys())) df.set(t, (df.get(t) ?? 0) + 1);
    return { id: m.id, tf, len: tokens.length };
  });
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg };
}

/** BM25, scores scaled so the best match is 1. */
export function lexicalSearch(index: LexicalIndex, query: string, k: number): Match[] {
  const q = Array.from(new Set(tokenize(query)));
  const N = index.docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const scored = index.docs.map((d) => {
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avg));
    }
    return { id: d.id, score: s };
  });
  const hits = scored.filter((m) => m.score > 0).sort((x, y) => y.score - x.score).slice(0, k);
  const top = hits[0]?.score ?? 1;
  return hits.map((m) => ({ id: m.id, score: m.score / top }));
}
