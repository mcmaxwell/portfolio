// Portfolio content adapters (design 2.9): read-only views over the site's own data, so the
// panels can show nothing but what the portfolio already says. Strings pass through untouched.
// Importing `testimonials` is a lint error anywhere under components/game (they are placeholders).
import { projects } from "@/data";
import { education, experience, owner, skills } from "@/lib/persona";

export const FEATURED_PROJECT_IDS = [1, 2, 3] as const;

export type GameProject = {
  id: number;
  title: string;
  description: string;
  image: string | null;
  icons: string[];
  tag: string | null;
  /** Set only when the data link starts with http (the rule the site's own Projects section uses). */
  link: string | null;
  clients: { name: string; url: string }[];
};

type RawProject = {
  id: number;
  title: string;
  des: string;
  img?: string;
  iconLists: string[];
  link: string;
  tag?: string;
  clients?: { name: string; url: string }[];
};

function adapt(p: RawProject): GameProject {
  return {
    id: p.id,
    title: p.title,
    description: p.des,
    image: p.img ? p.img : null,
    icons: [...p.iconLists],
    tag: p.tag ? p.tag : null,
    link: p.link?.startsWith("http") ? p.link : null,
    clients: (p.clients ?? []).map((c) => ({ name: c.name, url: c.url })),
  };
}

export function allProjects(): GameProject[] {
  return (projects as readonly RawProject[]).map(adapt);
}

/** XecSuite, NewsStocks.live, Apex Mind Automation: ids 1, 2, 3, in that order. Throws if one is missing. */
export function featuredProjects(): GameProject[] {
  const all = allProjects();
  return FEATURED_PROJECT_IDS.map((id) => {
    const p = all.find((x) => x.id === id);
    if (!p) throw new Error(`featured project ${id} is missing from data/index.ts`);
    return p;
  });
}

export function projectById(id: number): GameProject | null {
  return allProjects().find((p) => p.id === id) ?? null;
}

/** The name before the first spaced hyphen, en dash or em dash of a title ("XecSuite - AI Operating Layer" gives "XecSuite"). */
export function shortTitle(title: string): string {
  return title.split(/\s[\u2013\u2014-]\s/)[0].trim();
}

export type SkillGroup = { group: string; items: string };

/** "Group: items" strings split at the first ": ". A string without one is a group of its own. */
export function skillGroups(): SkillGroup[] {
  return skills.map((s) => {
    const i = s.indexOf(": ");
    return i < 0 ? { group: s, items: "" } : { group: s.slice(0, i), items: s.slice(i + 2) };
  });
}

/**
 * The Skills Workshop shows the persona's skill lines under a few readable headings. A heading
 * is the only text added; every line is shown unchanged, and a line with an unknown group is
 * kept in a final "More" bucket, so nothing from lib/persona.ts is ever dropped.
 */
export const WORKSHOP_BUCKETS: readonly { title: string; groups: readonly string[] }[] = [
  { title: "Front-end and e-commerce", groups: ["Languages & frameworks", "UI/UX", "State & data", "E-commerce"] },
  { title: "AI systems", groups: ["AI & agents", "Models", "AI media"] },
  { title: "Automation and tooling", groups: ["Automation", "Tooling & practices"] },
];

export function skillBuckets(): { title: string; groups: SkillGroup[] }[] {
  const all = skillGroups();
  const used = new Set<string>();
  const out = WORKSHOP_BUCKETS.map((b) => ({
    title: b.title,
    groups: b.groups.flatMap((g) => {
      const found = all.filter((x) => x.group === g);
      found.forEach((x) => used.add(x.group));
      return found;
    }),
  }));
  const rest = all.filter((x) => !used.has(x.group));
  if (rest.length) out.push({ title: "More", groups: rest });
  return out;
}

export type ExperienceEntry = { role: string; company: string; period: string; detail: string };

export function experienceEntries(): ExperienceEntry[] {
  return experience.map((e) => ({ role: e.role, company: e.company, period: e.period, detail: e.detail }));
}

export function educationEntries(): string[] {
  return [...education];
}

export type ContactLinks = {
  email: string;
  mailto: string;
  linkedin: string;
  /** The site as shown ("liutsko.me") and its URL. */
  siteLabel: string;
  site: string;
};

/** The contact options the site's own Contact section offers: email, LinkedIn and the site. */
export function contactLinks(): ContactLinks {
  return {
    email: owner.email,
    mailto: `mailto:${owner.email}`,
    linkedin: owner.linkedin,
    siteLabel: owner.site,
    site: `https://${owner.site}`,
  };
}

/** The name shown beside the action in the prompt ("View project: XecSuite"), where the item has one. */
export function promptTarget(panel: { kind: string; projectId?: number } | undefined): string | null {
  if (!panel || panel.kind !== "project" || panel.projectId === undefined) return null;
  const p = projectById(panel.projectId);
  return p ? shortTitle(p.title) : null;
}
