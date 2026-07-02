import { projects } from "@/data";
import { TermSection } from "./TermWindow";

export function Projects() {
  return (
    <TermSection id="projects" command="ls -la ./projects" title="~/projects">
      <div className="grid gap-5 sm:grid-cols-2">
        {projects.map((p, i) => {
          const external = p.link?.startsWith("http");
          const Wrapper = external ? "a" : "div";
          const linkProps = external
            ? { href: p.link, target: "_blank", rel: "noopener noreferrer" }
            : {};
          return (
            <Wrapper
              key={p.id}
              {...linkProps}
              className={`group flex flex-col overflow-hidden border border-term-line bg-term-bg/60 transition-colors ${
                external
                  ? "hover:border-term-green/60 hover:box-glow"
                  : "hover:border-term-line/80"
              }`}
            >
              {p.img && (
                <div className="relative h-40 w-full overflow-hidden border-b border-term-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.img}
                    alt={p.title}
                    className="h-full w-full object-cover object-top opacity-80 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-term-bg/80 to-transparent" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-term-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {p.tag ? (
                  <span className="border border-term-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-term-cyan">
                    {p.tag}
                  </span>
                ) : external ? (
                  <span className="text-term-muted transition-colors group-hover:text-term-green">
                    ↗
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wider text-term-muted">
                    private
                  </span>
                )}
              </div>
              <h3 className="mb-2 text-base font-bold text-term-green-bright group-hover:text-glow">
                {p.title}
              </h3>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-term-fg/80">
                {p.des}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {p.iconLists.map((icon) => (
                  <span
                    key={icon}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-term-line bg-term-panel"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={icon} alt="tech" width={14} height={14} />
                  </span>
                ))}
              </div>

              {p.clients && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.clients.map((c) =>
                    c.url ? (
                      <a
                        key={c.name}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-term-line px-2 py-0.5 text-xs text-term-muted transition-colors hover:border-term-green hover:text-term-green"
                      >
                        {c.name} ↗
                      </a>
                    ) : (
                      <span
                        key={c.name}
                        className="border border-term-line px-2 py-0.5 text-xs text-term-muted"
                      >
                        {c.name}
                      </span>
                    )
                  )}
                </div>
              )}
              </div>
            </Wrapper>
          );
        })}
      </div>
    </TermSection>
  );
}
