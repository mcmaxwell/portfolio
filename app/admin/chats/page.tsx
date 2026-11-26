import type { Metadata } from "next";
import { logStoreConfigured, readConversations, RETENTION_DAYS, type Conversation, type Turn } from "@/lib/chatLog";

// The private conversation log: what visitors asked the avatar and "Ask my memory". Behind Basic
// auth (middleware.ts). Never cached, never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversations", robots: { index: false, follow: false } };

const PER_PAGE = 30;
const TZ = "America/Toronto";
const when = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
const clock = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, timeStyle: "medium" }).format(new Date(ms));

const ROLE: Record<Turn["role"], { label: string; cls: string }> = {
  visitor: { label: "Visitor", cls: "text-term-accent" },
  avatar: { label: "Avatar", cls: "text-term-paper" },
  action: { label: "Action", cls: "text-term-muted" },
};

export default async function ChatsPage({ searchParams }: { searchParams: { page?: string } }) {
  const page = Math.max(0, Number.parseInt(searchParams.page ?? "0", 10) || 0);

  if (!logStoreConfigured()) {
    return (
      <Shell>
        <p className="max-w-xl text-term-fg/80">
          The log store is not connected yet. Add an Upstash Redis database to this project in Vercel (Storage, then
          Upstash for Redis). It sets KV_REST_API_URL and KV_REST_API_TOKEN, and conversations start showing here
          after the next deploy. Until then each turn is written to the function logs as a line starting with [chat].
        </p>
      </Shell>
    );
  }

  let data: { total: number; items: Conversation[] };
  try {
    data = await readConversations(page, PER_PAGE);
  } catch (err) {
    return (
      <Shell>
        <p className="text-term-red">Could not read the log: {err instanceof Error ? err.message : String(err)}</p>
      </Shell>
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / PER_PAGE));
  return (
    <Shell>
      <p className="mb-8 text-sm text-term-muted">
        {data.total} conversation{data.total === 1 ? "" : "s"} in the last {RETENTION_DAYS} days, newest first. Times are
        Eastern.
      </p>
      {data.items.length === 0 && <p className="text-term-fg/80">Nothing yet.</p>}
      <ol className="space-y-4">
        {data.items.map((c) => (
          <ConversationRow key={c.id} c={c} />
        ))}
      </ol>
      {pages > 1 && (
        <nav className="mt-10 flex items-center gap-4 text-sm" aria-label="Pages">
          {page > 0 && (
            <a className="link-draw text-term-paper" href={`?page=${page - 1}`}>
              ← Newer
            </a>
          )}
          <span className="text-term-muted">
            Page {page + 1} of {pages}
          </span>
          {page + 1 < pages && (
            <a className="link-draw text-term-paper" href={`?page=${page + 1}`}>
              Older →
            </a>
          )}
        </nav>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-16 md:px-10">
      <h1 className="mb-4 font-display text-4xl font-medium tracking-tight text-term-paper">Conversations</h1>
      {children}
    </main>
  );
}

function ConversationRow({ c }: { c: Conversation }) {
  const questions = c.turns.filter((t) => t.role === "visitor");
  const tags = [
    c.channel === "voice" ? "Voice avatar" : "Ask my memory",
    c.country,
    c.device,
    c.lens,
    c.referrer ? `from ${c.referrer}` : undefined,
  ].filter(Boolean);
  return (
    <li className="rounded-lg border border-term-line">
      <details>
        <summary className="cursor-pointer list-none px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-term-paper">{when(c.startedAt)}</span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-term-muted">{tags.join(" · ")}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-term-fg/80">
            {questions.length ? questions.map((q) => q.text).join("  /  ") : `${c.turns.length} turn${c.turns.length === 1 ? "" : "s"}, no question transcribed`}
          </p>
        </summary>
        <ol className="space-y-3 border-t border-term-line px-4 py-4">
          {c.turns.map((t, i) => (
            <li key={i} className="grid gap-1 text-sm sm:grid-cols-[6rem_1fr] sm:gap-4">
              <span className={`font-mono text-[11px] uppercase tracking-wider ${ROLE[t.role].cls}`}>
                {ROLE[t.role].label}
                <span className="block normal-case tracking-normal text-term-muted">{clock(t.at)}</span>
              </span>
              <span className={t.role === "action" ? "font-mono text-xs text-term-muted" : "whitespace-pre-wrap text-term-fg/90"}>
                {t.text}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
