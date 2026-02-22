import type { SkillsContent } from "@/lib/page-config/content-types";

type SkillsSectionProps = {
  content: SkillsContent;
  variant?: string;
};

export function SkillsSection({ content, variant = "chips" }: SkillsSectionProps) {
  const { groups } = content;

  if (variant === "list") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto max-w-[var(--page-max-width)] space-y-[var(--space-6)]">
          {groups.map((group) => (
            <div key={group.label}>
              <h3
                className="mb-[var(--space-2)] text-[var(--text-sm)] font-semibold uppercase tracking-wider text-[var(--page-fg-secondary)]"
                style={{ fontFamily: "var(--page-font-heading)" }}
              >
                {group.label}
              </h3>
              <ul className="space-y-[var(--space-1)]">
                {group.skills.map((skill) => (
                  <li
                    key={skill}
                    className="text-[var(--text-base)] text-[var(--page-fg)]"
                    style={{ fontFamily: "var(--page-font-body)" }}
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === "cloud") {
    const allSkills = groups.flatMap((g) => g.skills);
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto max-w-[var(--page-max-width)]">
          <div className="flex flex-wrap items-center justify-center gap-[var(--space-3)]">
            {allSkills.map((skill) => (
              <span
                key={skill}
                className="text-[var(--text-base)] text-[var(--page-fg-secondary)] transition-colors hover:text-[var(--page-accent)]"
                style={{
                  fontFamily: "var(--page-font-body)",
                  fontSize: `${0.875 + Math.random() * 0.75}rem`,
                  transitionDuration: "var(--transition-fast)",
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Default: "chips" variant (also handles "bars" which we render as chips with accent)
  return (
    <section className="px-[var(--space-6)] py-[var(--space-10)]">
      <div className="mx-auto max-w-[var(--page-max-width)] space-y-[var(--space-8)]">
        {groups.map((group) => (
          <div key={group.label}>
            <h3
              className="mb-[var(--space-3)] text-[var(--text-sm)] font-semibold uppercase tracking-wider text-[var(--page-fg-secondary)]"
              style={{ fontFamily: "var(--page-font-heading)" }}
            >
              {group.label}
            </h3>
            <div className="flex flex-wrap gap-[var(--space-2)]">
              {group.skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center rounded-full border border-[var(--page-badge-border)] bg-[var(--page-badge-bg)] px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-sm)] text-[var(--page-badge-fg)] transition-colors hover:border-[var(--page-accent)] hover:text-[var(--page-accent)]"
                  style={{
                    fontFamily: "var(--page-font-body)",
                    transitionDuration: "var(--transition-fast)",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
