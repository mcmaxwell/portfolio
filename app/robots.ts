import type { MetadataRoute } from "next";

// Search engines and AI crawlers (answer engines and model training alike) are welcome to the whole
// site; only the API routes and the private admin pages are off limits. The AI agents are named so the intent is
// explicit to crawlers that look for their own user agent.
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Meta-ExternalAgent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
      { userAgent: AI_AGENTS, allow: "/", disallow: ["/api/", "/admin/"] },
    ],
    sitemap: "https://liutsko.me/sitemap.xml",
    host: "https://liutsko.me",
  };
}
