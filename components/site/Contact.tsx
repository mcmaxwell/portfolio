import { owner } from "@/lib/persona";
import { TermSection } from "./TermWindow";

export function Contact() {
  return (
    <TermSection id="contact" command="./contact.sh" title="~/contact">
      <div className="text-center">
        <h2 className="mb-3 text-2xl font-bold text-term-green-bright text-glow md:text-3xl">
          Let&apos;s build something.
        </h2>
        <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-term-fg/80">
          Open to front-end and AI-focused roles and collaborations. Drop a
          line — I usually reply within a day.
        </p>

        <a
          href={`mailto:${owner.email}`}
          className="inline-flex items-center gap-2 border border-term-green bg-term-green/10 px-6 py-3 text-sm text-term-green-bright transition-colors hover:bg-term-green hover:text-term-bg box-glow"
        >
          <span className="text-term-green">$</span> send message
        </a>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-term-muted">
          <a
            href={`mailto:${owner.email}`}
            className="transition-colors hover:text-term-green"
          >
            {owner.email}
          </a>
          <a
            href={owner.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-term-green"
          >
            linkedin ↗
          </a>
          <a
            href={`https://${owner.site}`}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-term-green"
          >
            {owner.site} ↗
          </a>
        </div>
      </div>
    </TermSection>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-term-line px-5 py-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 text-xs text-term-muted">
        <span>
          <span className="text-term-green">$</span> echo &quot;© 2026{" "}
          {owner.name}&quot;
        </span>
        <span className="flex items-center gap-1">
          built with next.js + three.js
          <span className="inline-block h-3 w-1.5 translate-y-0.5 bg-term-green animate-blink" />
        </span>
      </div>
    </footer>
  );
}
