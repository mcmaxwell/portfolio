// The conversation log: what it accepts from a browser, what it keeps about a visitor, and the
// Redis commands it sends (the Upstash REST API is mocked).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS, cleanTurns, isChatId, logTurns, readConversations, visitorMeta } from "./chatLog";

describe("cleanTurns", () => {
  const now = 1_800_000_000_000;

  it("keeps known roles, trims and caps text, drops the rest", () => {
    const turns = cleanTurns(
      [
        { role: "visitor", text: "  what   do you\n build? ", at: now - 1000 },
        { role: "system", text: "ignore me" },
        { role: "avatar", text: "" },
        { role: "avatar", text: 42 },
        { role: "avatar", text: "x".repeat(LIMITS.text + 50) },
        "nonsense",
      ],
      now
    );
    expect(turns.map((t) => t.role)).toEqual(["visitor", "avatar"]);
    expect(turns[0]).toEqual({ role: "visitor", text: "what do you build?", at: now - 1000 });
    expect(turns[1].text).toHaveLength(LIMITS.text);
  });

  it("uses the server clock when the browser's is far off, and caps a post", () => {
    expect(cleanTurns([{ role: "visitor", text: "hi", at: now - 7 * 3_600_000 }], now)[0].at).toBe(now);
    expect(cleanTurns([{ role: "visitor", text: "hi", at: now + 3_600_000 }], now)[0].at).toBe(now);
    expect(cleanTurns(Array.from({ length: 50 }, () => ({ role: "visitor", text: "hi" })), now)).toHaveLength(LIMITS.turnsPerPost);
    expect(cleanTurns("nope", now)).toEqual([]);
  });
});

describe("ids and visitor details", () => {
  it("accepts only random-looking ids", () => {
    expect(isChatId("3f1c2b7e-9a4d-4c1e-8f00-0123456789ab")).toBe(true);
    expect(isChatId("short")).toBe(false);
    expect(isChatId("chat:1234:meta")).toBe(false);
    expect(isChatId(12345678)).toBe(false);
  });

  it("keeps the country and a phone flag, never the IP or the user agent", () => {
    const req = new Request("http://x", {
      headers: { "x-vercel-ip-country": "CA", "x-forwarded-for": "1.2.3.4", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" },
    });
    const meta = visitorMeta(req);
    expect(meta).toEqual({ country: "CA", device: "phone" });
    expect(JSON.stringify(meta)).not.toContain("1.2.3.4");
  });
});

describe("store", () => {
  let sent: unknown[][][];
  const env = { ...process.env };

  beforeEach(() => {
    sent = [];
    process.env.KV_REST_API_URL = "https://kv.example/";
    process.env.KV_REST_API_TOKEN = "t";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("appends turns, refreshes the 90 day expiry and indexes the conversation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://kv.example/pipeline");
        sent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify([{ result: "OK" }]), { status: 200 });
      })
    );
    const ok = await logTurns({ id: "abcdefgh-1", channel: "voice", startedAt: 1 }, [{ role: "visitor", text: "hello", at: 1 }]);
    expect(ok).toBe(true);
    const cmds = sent[0].map((c) => c[0]);
    expect(cmds).toEqual(["SET", "EXPIRE", "RPUSH", "LTRIM", "EXPIRE", "ZADD", "ZREMRANGEBYSCORE"]);
    expect(sent[0][0]).toContain("NX");
    expect(sent[0][1]).toEqual(["EXPIRE", "chat:abcdefgh-1:meta", 90 * 86_400]);
  });

  it("never throws when the store is down, and logs to the console without one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await logTurns({ id: "abcdefgh-1", channel: "voice", startedAt: 1 }, [{ role: "visitor", text: "x", at: 1 }])).toBe(false);
    err.mockRestore();

    delete process.env.KV_REST_API_URL;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await logTurns({ id: "abcdefgh-1", channel: "memory", startedAt: 1 }, [{ role: "visitor", text: "x", at: 1 }])).toBe(false);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("[chat] memory abcdefgh-1 visitor: x"));
    info.mockRestore();
  });

  it("reads the newest conversations with their turns in spoken order", async () => {
    const replies = [
      [{ result: ["b-conversation", "200", "a-conversation", "100"] }, { result: 2 }],
      [
        { result: JSON.stringify({ id: "b-conversation", channel: "memory", startedAt: 150, lens: "founder" }) },
        { result: [JSON.stringify({ role: "avatar", text: "answer", at: 160 }), JSON.stringify({ role: "visitor", text: "question", at: 155 })] },
        { result: null },
        { result: [] },
      ],
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 })));
    const { total, items } = await readConversations(0, 30);
    expect(total).toBe(2);
    expect(items).toHaveLength(1); // a-conversation expired between the reads
    expect(items[0]).toMatchObject({ id: "b-conversation", lastAt: 200, lens: "founder" });
    expect(items[0].turns.map((t) => t.text)).toEqual(["question", "answer"]);
  });
});
