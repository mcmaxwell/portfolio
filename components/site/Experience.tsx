import { experience, education } from "@/lib/persona";
import { TermSection } from "./TermWindow";

export function Experience() {
  return (
    <TermSection
      id="experience"
      command="git log --oneline career"
      title="~/experience"
    >
      <ol className="relative space-y-8 border-l border-term-line pl-6">
        {experience.map((e) => (
          <li key={e.role + e.company} className="relative">
            <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-term-green bg-term-bg" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h3 className="text-base font-bold text-term-green-bright">
                {e.role}
              </h3>
              <span className="text-xs text-term-muted">{e.period}</span>
            </div>
            <p className="text-sm text-term-cyan">{e.company}</p>
            <p className="mt-1 text-sm leading-relaxed text-term-fg/80">
              {e.detail}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-10 border-t border-term-line pt-6">
        <p className="mb-3 text-sm text-term-muted">
          <span className="text-term-green">$</span> cat education.txt
        </p>
        <ul className="space-y-1.5 text-sm text-term-fg/85">
          {education.map((ed) => (
            <li key={ed} className="flex gap-2">
              <span className="select-none text-term-green">▸</span>
              <span>{ed}</span>
            </li>
          ))}
        </ul>
      </div>
    </TermSection>
  );
}
