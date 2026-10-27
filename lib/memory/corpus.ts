/**
 * Everything "ask my memory" can retrieve: the site's own facts cut into short passages, each with
 * a place on the site to open. Built from the same data the pages render (cases, career, services,
 * skills), so the answers can never drift from what the site says.
 */
import { cases } from "@/data/cases";
import { education, experience, extraKnowledge, owner, services, skills } from "@/lib/persona";

export type MemoryKind = "case" | "role" | "service" | "skill" | "profile";

export type Memory = {
  id: string;
  kind: MemoryKind;
  title: string;
  /** Where on the site the passage comes from. */
  href: string;
  text: string;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function buildCorpus(): Memory[] {
  const out: Memory[] = [
    {
      id: "profile-about",
      kind: "profile",
      title: `${owner.name}, ${owner.role}`,
      href: "/#about",
      text: `${owner.about} Based in ${owner.location}. Email ${owner.email}.`,
    },
    {
      id: "profile-education",
      kind: "profile",
      title: "Education and certifications",
      href: "/#about",
      text: education.join(". ") + ".",
    },
  ];

  for (const c of cases) {
    const href = `/work/${c.slug}`;
    const facts = c.facts.map((f) => `${f.value} ${f.label}`).join(", ");
    out.push(
      { id: `case-${c.slug}`, kind: "case", title: `${c.name}: ${c.tagline}`, href, text: `${c.hook} ${c.problem} Facts: ${facts}.` },
      { id: `case-${c.slug}-built`, kind: "case", title: `${c.name}: what I built`, href, text: `${c.built.join(" ")} ${c.how}` },
      {
        id: `case-${c.slug}-role`,
        kind: "case",
        title: `${c.name}: role and results`,
        href,
        text: `${c.eyebrow}. ${c.role} ${c.results} Stack: ${c.stack.join(", ")}.`,
      }
    );
    if (c.clients) {
      out.push({
        id: `case-${c.slug}-clients`,
        kind: "case",
        title: `${c.name}: clients`,
        href,
        text: c.clients.map((cl) => `${cl.name}: ${cl.work}.`).join(" "),
      });
    }
  }

  for (const e of experience) {
    out.push({
      id: `role-${slug(e.company)}`,
      kind: "role",
      title: `${e.role}, ${e.company} (${e.period})`,
      href: "/#experience",
      text: e.detail,
    });
  }

  for (const s of services) {
    out.push({
      id: `service-${s.id}`,
      kind: "service",
      title: `Service: ${s.title}`,
      href: "/#services",
      text: `${s.summary} Proof: ${s.proof.join("; ")}. Tools: ${s.tags.join(", ")}.`,
    });
  }

  for (const line of skills) {
    const i = line.indexOf(": ");
    const group = i < 0 ? line : line.slice(0, i);
    out.push({ id: `skill-${slug(group)}`, kind: "skill", title: `Toolkit: ${group}`, href: "/#about", text: line });
  }

  // The free-text notes, one passage per paragraph or bullet.
  extraKnowledge
    .split(/\n+/)
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter((l) => l.length > 60)
    .forEach((text, i) => out.push({ id: `note-${i}`, kind: "profile", title: "From my notes", href: "/#about", text }));

  return out;
}

/** The text a passage is embedded and keyword-searched by. */
export const memoryText = (m: Memory) => `${m.title}. ${m.text}`;
