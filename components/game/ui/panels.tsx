"use client";

// Portfolio panels (design 2.10): accessible HTML dialogs built only from the site's own content
// (content.ts). Links open only on an explicit click or key press, in one new tab, with
// rel="noopener noreferrer"; nothing is sent or opened automatically.
import { useRef, type ReactNode } from "react";
import type { PanelId } from "../config";
import {
  allProjects,
  contactLinks,
  educationEntries,
  experienceEntries,
  featuredProjects,
  skillBuckets,
  type GameProject,
} from "../content";
import { Dialog } from "../shell/Dialog";

const TITLE_ID = "game-panel-title";
const BUTTON =
  "min-h-[44px] border border-term-line px-4 py-2 text-xs text-term-muted transition-colors hover:border-term-green hover:text-term-green-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-green";
const LINK = "break-all text-term-cyan underline underline-offset-2 hover:text-term-green-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-green";

/** One external link: a single new tab, opened only when activated. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Icons({ icons }: { icons: string[] }) {
  if (icons.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-term-muted">Technologies</h3>
      <ul className="flex flex-wrap items-center gap-3">
        {icons.map((src, i) => (
          <li key={`${src}-${i}`} className="flex h-8 w-8 items-center justify-center border border-term-line bg-term-bg/60 p-1">
            {/* Decorative: the portfolio data has icons only, no technology names. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="max-h-full max-w-full" />
          </li>
        ))}
      </ul>
      <p className="sr-only">Technology icons only; the portfolio data lists no technology names.</p>
    </div>
  );
}

function ProjectLink({ project }: { project: GameProject }) {
  if (!project.link) return <p className="text-xs uppercase tracking-wider text-term-muted">private</p>;
  return (
    <p className="text-sm">
      <ExternalLink href={project.link}>{project.link}</ExternalLink>
    </p>
  );
}

function ProjectBody({ project, headingId }: { project: GameProject; headingId?: string }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 id={headingId} className="text-base font-bold text-term-green-bright">
          {project.title}
        </h2>
        {project.tag && <span className="border border-term-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-term-cyan">{project.tag}</span>}
      </div>
      {project.image && (
        <div className="mb-4 overflow-hidden border border-term-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.image} alt={`Screenshot of ${project.title}`} className="max-h-56 w-full object-cover object-top" />
        </div>
      )}
      <p className="mb-4 leading-relaxed text-term-fg/90">{project.description}</p>
      <Icons icons={project.icons} />
      <ProjectLink project={project} />
    </>
  );
}

function Header({ title, id, onClose, closeRef }: { title: string; id: string; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement> }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4 border-b border-term-line pb-3">
      <h2 id={id} className="text-base font-bold text-term-green-bright">
        {title}
      </h2>
      <button ref={closeRef} type="button" onClick={onClose} className={BUTTON} aria-label="Close panel">
        [ close ]
      </button>
    </div>
  );
}

function Frame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog labelledBy={TITLE_ID} onClose={onClose} initialFocusRef={closeRef} wide>
      <Header title={title} id={TITLE_ID} onClose={onClose} closeRef={closeRef} />
      {children}
    </Dialog>
  );
}

function ProjectPanel({ id, onClose, onOpen }: { id: number; onClose: () => void; onOpen: (p: PanelId) => void }) {
  const project = featuredProjects().find((p) => p.id === id);
  const closeRef = useRef<HTMLButtonElement>(null);
  if (!project) return <Frame title="Project" onClose={onClose}>This project is not available.</Frame>;
  return (
    <Dialog labelledBy={TITLE_ID} onClose={onClose} initialFocusRef={closeRef} wide>
      <div className="mb-4 flex justify-end">
        <button ref={closeRef} type="button" onClick={onClose} className={BUTTON} aria-label="Close panel">
          [ close ]
        </button>
      </div>
      <ProjectBody project={project} headingId={TITLE_ID} />
      <div className="mt-5 flex flex-wrap gap-3 border-t border-term-line pt-4">
        <button type="button" onClick={() => onOpen({ kind: "all-projects" })} className={BUTTON}>
          [ all projects ]
        </button>
      </div>
    </Dialog>
  );
}

function AllProjectsPanel({ onClose }: { onClose: () => void }) {
  const projects = allProjects();
  return (
    <Frame title="All projects" onClose={onClose}>
      <ul className="space-y-6">
        {projects.map((p) => (
          <li key={p.id} className="border-b border-term-line pb-5 last:border-b-0">
            <h3 className="mb-1 text-sm font-bold text-term-green-bright">{p.title}</h3>
            {p.tag && <p className="mb-2 text-[10px] uppercase tracking-wider text-term-cyan">{p.tag}</p>}
            <p className="mb-3 leading-relaxed text-term-fg/90">{p.description}</p>
            <ProjectLink project={p} />
            {p.clients.length > 0 && (
              <div className="mt-3">
                <h4 className="mb-1 text-xs uppercase tracking-wider text-term-muted">Clients</h4>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {p.clients.map((c) => (
                    <li key={c.name}>
                      <ExternalLink href={c.url}>{c.name}</ExternalLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function SkillsPanel({ onClose }: { onClose: () => void }) {
  return (
    <Frame title="Skills" onClose={onClose}>
      <div className="space-y-6">
        {skillBuckets().map((b) => (
          <section key={b.title} aria-label={b.title}>
            <h3 className="mb-2 text-sm font-bold text-term-green-bright">{b.title}</h3>
            <dl className="space-y-2">
              {b.groups.map((g) => (
                <div key={g.group}>
                  <dt className="text-xs uppercase tracking-wider text-term-cyan">{g.group}</dt>
                  <dd className="leading-relaxed text-term-fg/90">{g.items}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Frame>
  );
}

function ExperiencePanel({ onClose }: { onClose: () => void }) {
  return (
    <Frame title="Experience" onClose={onClose}>
      <ol className="space-y-5">
        {experienceEntries().map((e) => (
          <li key={`${e.company}-${e.period}`}>
            <h3 className="text-sm font-bold text-term-green-bright">{e.role}</h3>
            <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-term-muted">
              <span>{e.company}</span>{" "}
              <span aria-hidden="true" className="inline-block h-3 w-px bg-term-line" />{" "}
              <span>{e.period}</span>
            </p>
            <p className="leading-relaxed text-term-fg/90">{e.detail}</p>
          </li>
        ))}
      </ol>
      <h3 className="mb-2 mt-6 text-sm font-bold text-term-green-bright">Education and certifications</h3>
      <ul className="list-disc space-y-1 pl-5 text-term-fg/90">
        {educationEntries().map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </Frame>
  );
}

function ContactPanel({ onClose }: { onClose: () => void }) {
  const c = contactLinks();
  return (
    <Frame title="Contact" onClose={onClose}>
      <ul className="space-y-3">
        <li>
          <span className="block text-xs uppercase tracking-wider text-term-muted">Email</span>
          <a href={c.mailto} rel="noopener noreferrer" className={LINK}>
            {c.email}
          </a>
        </li>
        <li>
          <span className="block text-xs uppercase tracking-wider text-term-muted">LinkedIn</span>
          <ExternalLink href={c.linkedin}>{c.linkedin}</ExternalLink>
        </li>
        <li>
          <span className="block text-xs uppercase tracking-wider text-term-muted">Site</span>
          <ExternalLink href={c.site}>{c.siteLabel}</ExternalLink>
        </li>
      </ul>
    </Frame>
  );
}

/** The panels this milestone ships. Controls, settings and completion arrive with their features. */
export function hasPanel(panel: PanelId): boolean {
  return ["project", "all-projects", "skills", "experience", "contact"].includes(panel.kind);
}

export function PortfolioPanel({ panel, onClose, onOpen }: { panel: PanelId; onClose: () => void; onOpen: (p: PanelId) => void }) {
  switch (panel.kind) {
    case "project":
      return <ProjectPanel key={`project-${panel.projectId}`} id={panel.projectId} onClose={onClose} onOpen={onOpen} />;
    case "all-projects":
      return <AllProjectsPanel key="all-projects" onClose={onClose} />;
    case "skills":
      return <SkillsPanel key="skills" onClose={onClose} />;
    case "experience":
      return <ExperiencePanel key="experience" onClose={onClose} />;
    case "contact":
      return <ContactPanel key="contact" onClose={onClose} />;
    default:
      return (
        <Frame key={panel.kind} title="Not available yet" onClose={onClose}>
          <p>This panel is not part of this version of the game.</p>
        </Frame>
      );
  }
}
