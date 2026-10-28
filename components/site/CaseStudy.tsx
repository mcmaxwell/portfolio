import type { CSSProperties } from "react";
import { nextCase, type CaseStudy as Case } from "@/data/cases";
import { owner } from "@/lib/persona";
import { CaseMedia, CaseScreens } from "./CaseMedia";
import { SiteFooter } from "./Contact";
import { TransitionLink } from "@/components/site/TransitionLink";

/** Names the element for the view transition from the card on the home page (TransitionLink.tsx). */
export const vt = (name: string) => ({ "--vt": name }) as CSSProperties;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-term-line py-10 md:grid-cols-12 md:gap-8 md:py-14">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-term-accent md:col-span-3 md:pt-1.5">{label}</h2>
      <div className="text-base leading-relaxed text-term-fg/85 md:col-span-8 md:col-start-5 md:text-lg">{children}</div>
    </div>
  );
}

/**
 * One case study page: the story behind a project card. Server-rendered, plain scroll (no Lenis,
 * no custom cursor), so it is light and indexable; the only motion is the view transition in from
 * the card and the media loop.
 */
export function CaseStudy({ c }: { c: Case }) {
  const next = nextCase(c.slug);
  return (
    <main className="min-h-screen bg-term-bg text-term-fg [overflow-x:clip]">
      <header className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-5 text-sm md:px-10">
        <TransitionLink href="/" className="flex items-center gap-3 text-term-paper">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-term-accent/60 font-mono text-[10px] font-bold text-term-accent">
            ML
          </span>
          <span className="hidden sm:inline">maksym.liutsko</span>
        </TransitionLink>
        <nav aria-label="Case navigation" className="flex items-center gap-5 text-term-muted">
          <TransitionLink href="/#projects" className="link-draw hover:text-term-paper">
            ← All work
          </TransitionLink>
          <TransitionLink href={`/work/${next.slug}`} className="link-draw hover:text-term-paper">
            Next: {next.name} →
          </TransitionLink>
        </nav>
      </header>

      <article className="mx-auto w-full max-w-[1400px] px-5 pb-24 pt-10 md:px-10 md:pt-20">
        <div className="flex items-center gap-3 font-mono text-xs text-term-muted">
          <span className="text-term-accent">Case</span>
          <span className="h-px w-8 bg-term-line" />
          <span>{c.eyebrow}</span>
        </div>
        <h1
          style={vt(`case-title-${c.slug}`)}
          className="mt-6 max-w-[12ch] font-display text-[clamp(2.75rem,10vw,7.5rem)] font-medium leading-[0.92] tracking-[-0.04em] text-term-paper"
        >
          {c.name}
        </h1>
        <p className="mt-5 max-w-[32ch] text-lg text-term-muted md:text-2xl">{c.tagline}</p>

        <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-12 md:items-end">
          <p className="font-display text-2xl leading-snug text-term-paper md:col-span-7 md:text-4xl md:leading-tight">{c.hook}</p>
          <dl className="grid grid-cols-3 gap-4 md:col-span-5 md:col-start-8">
            {c.facts.map((f) => (
              <div key={f.label} className="border-t border-term-line pt-4">
                <dd className="font-display text-3xl font-medium tracking-tight text-term-paper md:text-4xl xl:text-5xl">{f.value}</dd>
                <dt className="mt-1 text-xs leading-snug text-term-muted">{f.label}</dt>
              </div>
            ))}
          </dl>
        </div>

        <div
          style={vt(`case-media-${c.slug}`)}
          className="relative mt-14 aspect-video overflow-hidden rounded-2xl border border-term-line bg-term-panel md:mt-20"
        >
          <CaseMedia media={c.media} name={c.name} />
        </div>

        <div className="mt-20 md:mt-28">
          <Section label="Problem">
            <p>{c.problem}</p>
          </Section>
          <Section label="What I built">
            <ul className="space-y-3">
              {c.built.map((b) => (
                <li key={b} className="flex gap-3">
                  <span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-term-accent" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section label="How it works">
            <p>{c.how}</p>
          </Section>
          {c.screens && (
            <div className="border-t border-term-line py-10 md:py-14">
              <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.2em] text-term-accent">{c.screensLabel ?? "Screens"}</h2>
              <CaseScreens screens={c.screens} />
            </div>
          )}
          <Section label="Results">
            <p className="text-term-paper">{c.results}</p>
          </Section>
          <Section label="My role">
            <p>{c.role}</p>
          </Section>
          {c.clients && (
            <Section label="Clients">
              <ul className="divide-y divide-term-line border-y border-term-line">
                {c.clients.map((cl) => (
                  <li key={cl.name} className="grid gap-1 py-4 sm:grid-cols-12 sm:gap-6">
                    <a
                      href={cl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-draw text-term-paper sm:col-span-4"
                    >
                      {cl.name} ↗<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <span className="text-sm text-term-fg/75 sm:col-span-8">{cl.work}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section label="Stack">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-sm text-term-muted">
              {c.stack.map((s) => (
                <li key={s}>
                  <span className="text-term-accent">/</span> {s}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-3 border-t border-term-line pt-12">
          {c.link && (
            <a
              href={c.link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-term-accent px-7 py-3.5 text-sm font-bold text-term-bg transition-colors hover:bg-term-accent-bright"
            >
              {c.linkLabel ?? "Visit"} ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <TransitionLink
            href="/#contact"
            className="rounded-full border border-term-paper/30 px-7 py-3.5 text-sm text-term-paper transition-colors hover:border-term-paper hover:bg-term-paper hover:text-term-bg"
          >
            Build something like this with me
          </TransitionLink>
          <span className="ml-auto text-sm text-term-muted">{owner.location}</span>
        </div>
      </article>

      <TransitionLink
        href={`/work/${next.slug}`}
        className="group block border-t border-term-line bg-term-panel/40 transition-colors hover:bg-term-panel"
      >
        <div className="mx-auto flex w-full max-w-[1400px] items-end justify-between gap-6 px-5 py-16 md:px-10 md:py-24">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-term-muted">Next case</p>
            <p className="mt-3 font-display text-4xl font-medium tracking-[-0.03em] text-term-paper transition-transform duration-500 group-hover:translate-x-2 md:text-7xl">
              {next.name}
            </p>
            <p className="mt-2 text-sm text-term-muted md:text-base">{next.tagline}</p>
          </div>
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-term-paper/30 text-xl text-term-paper transition-colors group-hover:border-term-accent group-hover:bg-term-accent group-hover:text-term-bg">
            →
          </span>
        </div>
      </TransitionLink>
      <SiteFooter />
    </main>
  );
}
