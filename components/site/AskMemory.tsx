"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { buildCorpus, type Memory, type MemoryKind } from "@/lib/memory/corpus";
import { buildLexicalIndex, lexicalSearch, type Match } from "@/lib/memory/search";
import { LENSES, LENS_LABEL, LENS_QUESTIONS } from "@/lib/memory/lenses";
import { useLens } from "@/lib/memory/useLens";
import { FadeIn, RevealText, SectionLabel } from "./ui";

type Step = { label: string; detail?: string; state: "run" | "done" | "skip" };

type Result = {
  mode: "semantic" | "keyword";
  matches: Match[];
  answer: string;
  note?: string;
};

type Semantic = {
  mode: "semantic";
  corpusSize: number;
  matches: Match[];
  answer: string;
  model: { embedding: string; answer: string };
  timings: { embedMs: number; searchMs: number; answerMs: number };
};

const KIND_LABEL: Record<MemoryKind, string> = {
  case: "Case",
  role: "Career",
  service: "Service",
  skill: "Toolkit",
  profile: "Profile",
};

const ms = (n: number) => `${n} ms`;

/**
 * "Ask my memory": a visible retrieval pipeline over the site's own content. The question is
 * embedded on the server (app/api/memory), the closest passages are shown with their similarity,
 * and a short answer is written from those passages alone. If the server is unavailable (no key,
 * rate limit, offline) the same passages are ranked by keywords in the browser instead, so the
 * section always answers something true. The "Who are you?" lens changes the suggested questions,
 * the tone of the answer and the contact pitch.
 */
export function AskMemory() {
  const corpus = useMemo(buildCorpus, []);
  const byId = useMemo(() => new Map(corpus.map((m) => [m.id, m])), [corpus]);
  const index = useMemo(() => buildLexicalIndex(corpus), [corpus]);
  const { lens, setLens } = useLens();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);

  // "/" jumps to the question from anywhere on the page, as in most docs sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = async (question: string) => {
    const text = question.trim();
    if (text.length < 2 || busy) return;
    const id = ++runId.current;
    setBusy(true);
    setResult(null);
    setSteps([
      { label: "Embedding your question", state: "run" },
      { label: `Searching ${corpus.length} memories`, state: "run" },
      { label: "Writing an answer from the closest four", state: "run" },
    ]);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, lens }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Semantic;
      if (id !== runId.current) return;
      setSteps([
        { label: "Embedding your question", detail: `${data.model.embedding} · ${ms(data.timings.embedMs)}`, state: "done" },
        { label: `Searching ${data.corpusSize} memories`, detail: `cosine similarity · ${ms(data.timings.searchMs)}`, state: "done" },
        { label: "Writing an answer from the closest four", detail: `${data.model.answer} · ${ms(data.timings.answerMs)}`, state: "done" },
      ]);
      setResult({ mode: "semantic", matches: data.matches.filter((m) => byId.has(m.id)), answer: data.answer });
    } catch {
      if (id !== runId.current) return;
      const matches = lexicalSearch(index, text, 4);
      setSteps([
        { label: "Embedding your question", detail: "server unavailable", state: "skip" },
        { label: `Searching ${corpus.length} memories`, detail: "keyword ranking (BM25) in your browser", state: "done" },
        { label: "Writing an answer", detail: "skipped, showing the passages", state: "skip" },
      ]);
      setResult({
        mode: "keyword",
        matches,
        answer: "",
        note: matches.length ? undefined : "Nothing in my memory matches those words. Try another phrasing, or just email me.",
      });
    } finally {
      if (id === runId.current) setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(q);
  };

  const ask = (question: string) => {
    setQ(question);
    void run(question);
  };

  return (
    <section id="memory" aria-label="Ask my memory" className="mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-40">
      <SectionLabel index="✦" label="Ask my memory" />
      <div className="grid gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <RevealText
            text="Still curious? Ask my memory."
            className="max-w-[12ch] font-display text-5xl font-medium leading-[0.95] tracking-[-0.04em] text-term-paper md:text-7xl"
          />
          <FadeIn>
            <p className="mt-8 max-w-md text-base leading-relaxed text-term-fg/80">
              Everything on this site, cut into {corpus.length} passages. Your question is matched by meaning, the closest
              passages are shown with how close they are, and the answer is written from them alone.
            </p>
            <div className="mt-10">
              <p id="lens-label" className="mb-3 text-[10px] uppercase tracking-[0.2em] text-term-muted">
                Who are you?
              </p>
              <div role="group" aria-labelledby="lens-label" className="inline-flex rounded-full border border-term-line p-1">
                {LENSES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lens === l}
                    onClick={() => setLens(l)}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      lens === l ? "bg-term-paper text-term-bg" : "text-term-muted hover:text-term-paper"
                    }`}
                  >
                    {LENS_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>

        <div className="md:col-span-7">
          <form onSubmit={submit} className="flex items-center gap-3 border-b border-term-paper/30 pb-3 focus-within:border-term-accent">
            <span aria-hidden className="font-mono text-term-accent">?</span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={200}
              aria-label="Ask my memory"
              placeholder="Ask anything about my work"
              className="min-w-0 flex-1 bg-transparent font-display text-xl text-term-paper outline-none placeholder:text-term-muted md:text-3xl"
            />
            <kbd aria-hidden className="hidden rounded border border-term-line px-1.5 py-0.5 font-mono text-[11px] text-term-muted md:inline">
              /
            </kbd>
            <button
              type="submit"
              disabled={busy || q.trim().length < 2}
              className="rounded-full bg-term-accent px-5 py-2.5 text-sm font-bold text-term-bg transition-colors hover:bg-term-accent-bright disabled:opacity-40"
            >
              {busy ? "Thinking…" : "Ask"}
            </button>
          </form>

          <ul aria-label="Suggested questions" className="mt-5 flex flex-wrap gap-2">
            {LENS_QUESTIONS[lens].map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => ask(s)}
                  disabled={busy}
                  className="rounded-full border border-term-line px-3.5 py-1.5 text-left text-xs text-term-fg/80 transition-colors hover:border-term-accent hover:text-term-accent disabled:opacity-40"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>

          <div aria-live="polite" className="mt-10">
            {steps.length > 0 && (
              <ol aria-label="How this answer was made" className="space-y-2 font-mono text-xs">
                {steps.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3">
                    <span
                      aria-hidden
                      className={
                        s.state === "done" ? "text-term-accent" : s.state === "skip" ? "text-term-muted" : "animate-pulse text-term-paper"
                      }
                    >
                      {s.state === "done" ? "●" : s.state === "skip" ? "○" : "◌"}
                    </span>
                    <span className={s.state === "skip" ? "text-term-muted line-through decoration-term-line" : "text-term-paper"}>{s.label}</span>
                    {s.detail && <span className="text-term-muted">{s.detail}</span>}
                  </li>
                ))}
              </ol>
            )}

            {result?.answer && (
              <p className="mt-8 font-display text-xl leading-snug text-term-paper md:text-2xl">{result.answer}</p>
            )}
            {result?.note && <p className="mt-8 text-base text-term-fg/80">{result.note}</p>}

            {result && result.matches.length > 0 && (
              <ul aria-label="Memories used" className="mt-8 divide-y divide-term-line border-y border-term-line">
                {result.matches.map((m) => (
                  <MemoryRow key={m.id} memory={byId.get(m.id)!} score={m.score} mode={result.mode} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MemoryRow({ memory, score, mode }: { memory: Memory; score: number; mode: Result["mode"] }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const label = mode === "semantic" ? `similarity ${score.toFixed(2)}` : `keyword match ${pct}%`;
  return (
    <li className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
      <div className="sm:col-span-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-term-accent">{KIND_LABEL[memory.kind]}</p>
        <a href={memory.href} className="link-draw mt-1 inline-block text-sm text-term-paper">
          {memory.title}
        </a>
        <div className="mt-2 flex items-center gap-2" title={label}>
          <span aria-hidden className="h-1 w-20 overflow-hidden rounded-full bg-term-line">
            <span className="block h-full rounded-full bg-term-accent" style={{ width: `${pct}%` }} />
          </span>
          <span className="font-mono text-[11px] text-term-muted">{label}</span>
        </div>
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-term-fg/75 sm:col-span-8">{memory.text}</p>
    </li>
  );
}
