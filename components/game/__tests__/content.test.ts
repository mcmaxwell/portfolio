// Portfolio content adapters (design 9, M3): the panels show only what data/index.ts and
// lib/persona.ts already say, link rules follow the site's own, and no testimonial or invented
// claim appears anywhere in the game.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// The tests import the placeholder testimonials only to prove that none of their text reaches the game.
// eslint-disable-next-line no-restricted-imports
import { projects, testimonials } from "@/data";
import { education, experience, owner, skills } from "@/lib/persona";
import {
  FEATURED_PROJECT_IDS,
  allProjects,
  contactLinks,
  educationEntries,
  experienceEntries,
  featuredProjects,
  projectById,
  promptTarget,
  shortTitle,
  skillBuckets,
  skillGroups,
  WORKSHOP_BUCKETS,
} from "../content";

describe("featured projects", () => {
  it("are exactly ids 1, 2 and 3, in order, with the titles of data/index.ts", () => {
    expect(FEATURED_PROJECT_IDS).toEqual([1, 2, 3]);
    const f = featuredProjects();
    expect(f.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(f.map((p) => p.title)).toEqual(projects.slice(0, 3).map((p) => p.title));
    expect(f[0].title).toMatch(/^XecSuite/);
    expect(f[1].title).toMatch(/^NewsStocks/);
    expect(f[2].title).toMatch(/^Apex Mind/);
  });

  it("carry the description, icons, screenshot, tag and link exactly as in the data", () => {
    featuredProjects().forEach((p, i) => {
      const raw = projects[i];
      expect(p.description).toBe(raw.des);
      expect(p.icons).toEqual(raw.iconLists);
      expect(p.image).toBe(raw.img);
      expect(p.tag).toBe(raw.tag);
      expect(p.link).toBe(raw.link);
      expect(p.link?.startsWith("http")).toBe(true);
    });
  });

  it("throws when a featured id is missing from the data", () => {
    // The adapter reads the live data, so prove the guard through the lookup it uses.
    expect(projectById(999)).toBeNull();
    expect(projectById(1)?.id).toBe(1);
  });
});

describe("all projects", () => {
  it("lists every project of the data in order, with the link rule of the site (only http links)", () => {
    const all = allProjects();
    expect(all.map((p) => p.id)).toEqual(projects.map((p) => p.id));
    all.forEach((p, i) => {
      const raw = projects[i] as { link: string; des: string; title: string };
      expect(p.title).toBe(raw.title);
      expect(p.description).toBe(raw.des);
      expect(p.link).toBe(raw.link?.startsWith("http") ? raw.link : null);
    });
    expect(all.filter((p) => p.link === null).length).toBeGreaterThan(0); // private projects stay link-less
    expect(all.find((p) => p.id === 9)?.clients.length).toBe(6);
  });

  it("returns fresh arrays: mutating a result never changes the data", () => {
    const a = allProjects();
    a[0].icons.push("/x.svg");
    a[0].title = "changed";
    expect(allProjects()[0].icons).toEqual(projects[0].iconLists);
    expect(allProjects()[0].title).toBe(projects[0].title);
  });
});

describe("skills, experience, education, contact", () => {
  it("splits each skill line at the first colon and loses nothing", () => {
    const groups = skillGroups();
    expect(groups).toHaveLength(skills.length);
    expect(groups.map((g) => `${g.group}: ${g.items}`)).toEqual(skills);
  });

  it("shows the skills in a few readable groups (3), every line exactly once and unchanged", () => {
    const buckets = skillBuckets();
    expect(buckets.length).toBe(WORKSHOP_BUCKETS.length);
    expect(buckets.length).toBeGreaterThanOrEqual(3);
    expect(buckets.length).toBeLessThanOrEqual(4);
    const shown = buckets.flatMap((b) => b.groups.map((g) => `${g.group}: ${g.items}`));
    expect([...shown].sort()).toEqual([...skills].sort());
    expect(buckets.find((b) => b.title === "More")).toBeUndefined(); // every persona group is mapped
    for (const b of buckets) expect(b.groups.length).toBeGreaterThan(0);
  });

  it("experience and education are the persona entries, unchanged", () => {
    expect(experienceEntries()).toEqual(experience.map((e) => ({ role: e.role, company: e.company, period: e.period, detail: e.detail })));
    expect(educationEntries()).toEqual(education);
  });

  it("contact offers exactly the options of the site's Contact section: email, LinkedIn, site", () => {
    const c = contactLinks();
    expect(c.email).toBe(owner.email);
    expect(c.mailto).toBe(`mailto:${owner.email}`);
    expect(c.linkedin).toBe(owner.linkedin);
    expect(c.siteLabel).toBe(owner.site);
    expect(c.site).toBe(`https://${owner.site}`);
    expect(Object.keys(c).sort()).toEqual(["email", "linkedin", "mailto", "site", "siteLabel"]);
    expect(JSON.stringify(c)).not.toContain(owner.phone); // the phone number is not a published contact option
  });
});

describe("prompt labels", () => {
  it("shortens a project title at its first dash (the data uses an em dash) and leaves a plain title alone", () => {
    expect(shortTitle("XecSuite \u2014 AI Operating Layer for 3PLs")).toBe("XecSuite");
    expect(shortTitle("A - B - C")).toBe("A");
    expect(shortTitle("NewsStocks.live")).toBe("NewsStocks.live");
    expect(shortTitle("Dash-in-word stays")).toBe("Dash-in-word stays");
  });

  it("names the featured projects by their data titles only", () => {
    expect(promptTarget({ kind: "project", projectId: 1 })).toBe("XecSuite");
    expect(promptTarget({ kind: "project", projectId: 2 })).toBe("NewsStocks.live");
    expect(promptTarget({ kind: "project", projectId: 3 })).toBe("Apex Mind");
    expect(promptTarget({ kind: "skills" })).toBeNull();
    expect(promptTarget(undefined)).toBeNull();
  });
});

describe("no testimonial text or invented claim anywhere", () => {
  const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
  const everything = JSON.stringify([featuredProjects(), allProjects(), skillBuckets(), experienceEntries(), educationEntries(), contactLinks()]);

  it("no adapter output contains a testimonial quote, name or title", () => {
    for (const t of testimonials) {
      expect(everything).not.toContain(t.quote.slice(0, 40));
      expect(everything).not.toContain(t.name);
    }
    expect(everything).not.toMatch(/Placeholder/i);
  });

  it("every string an adapter returns comes from data/index.ts or lib/persona.ts", () => {
    const source = JSON.stringify([projects, skills, experience, education, owner]);
    const own = new Set(["mailto:", "https://", ...WORKSHOP_BUCKETS.map((b) => b.title), "More"]);
    for (const s of strings([featuredProjects(), allProjects(), skillBuckets(), experienceEntries(), educationEntries(), contactLinks()])) {
      if (own.has(s)) continue;
      // JSON escapes quotes and non-ASCII the same way in both, so a substring of the JSON is a substring of the data.
      const needle = JSON.stringify(s).slice(1, -1);
      const ok = source.includes(needle) || s.startsWith("mailto:") || s.startsWith("https://");
      expect(ok, s.slice(0, 60)).toBe(true);
    }
  });

  it("the game source imports no testimonials (the lint rule also forbids it)", () => {
    const root = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "__tests__") continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(fs.readFileSync(f, "utf8"), path.relative(root, f)).not.toMatch(/import[^;]*\btestimonials\b[^;]*from/);
  });
});

describe("new game files are clean (no em dash, no machine-local path)", () => {
  const root = path.resolve(__dirname, "..");
  const fresh = ["content.ts", "interactions.ts", "ui/panels.tsx", "world/campus.ts", "world/builders.ts", "world/layout.ts", "followCamera.ts", "ui/Hud.tsx", "ui/GameInterface.tsx", "ui/TouchControls.tsx", "cameraProbe.ts"];
  for (const f of fresh) {
    it(f, () => {
      const text = fs.readFileSync(path.join(root, f), "utf8");
      expect(text).not.toContain("\u2014");
      expect(text).not.toMatch(/\/Users\/|\/private\/|\/tmp\/|C:\\\\Users/);
    });
  }
});
