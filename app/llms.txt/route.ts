import { projects } from "@/data";
import { education, experience, owner, skills } from "@/lib/persona";

export const dynamic = "force-static";

// /llms.txt (llmstxt.org): a plain Markdown summary of the site for AI agents and LLM-based search,
// built from the same data as the page so the two never drift apart.
export function GET() {
  const work = projects
    .map((p) => `- ${p.link.startsWith("http") ? `[${p.title}](${p.link})` : p.title}: ${p.summary} (${p.role})`)
    .join("\n");
  const career = experience.map((e) => `- ${e.role}, ${e.company} (${e.period}): ${e.detail}`).join("\n");

  const body = `# ${owner.name}

> ${owner.role}. ${owner.location}.

${owner.about}

## Contact

- Website: https://${owner.site}
- Email: ${owner.email}
- LinkedIn: ${owner.linkedin}
- GitHub: https://github.com/mcmaxwell

## Selected work

${work}

## Career

${career}

## Skills

${skills.map((s) => `- ${s}`).join("\n")}

## Education and certifications

${education.map((e) => `- ${e}`).join("\n")}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
