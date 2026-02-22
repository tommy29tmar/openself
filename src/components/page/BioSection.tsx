import type { BioContent } from "@/lib/page-config/content-types";

type BioSectionProps = {
  content: BioContent;
  variant?: string;
};

export function BioSection({ content, variant = "full" }: BioSectionProps) {
  const { text } = content;

  if (variant === "quote-style") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto max-w-[var(--page-max-width)]">
          <blockquote className="border-l-[3px] border-[var(--page-accent)] pl-[var(--space-6)]">
            <p
              className="text-[var(--text-lg)] italic leading-relaxed text-[var(--page-fg-secondary)]"
              style={{ fontFamily: "var(--page-font-body)" }}
            >
              {text}
            </p>
          </blockquote>
        </div>
      </section>
    );
  }

  if (variant === "short") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-8)]">
        <div className="mx-auto max-w-[var(--page-max-width)]">
          <p
            className="text-[var(--text-base)] leading-relaxed text-[var(--page-fg-secondary)]"
            style={{ fontFamily: "var(--page-font-body)" }}
          >
            {text}
          </p>
        </div>
      </section>
    );
  }

  // Default: "full" variant
  return (
    <section className="px-[var(--space-6)] py-[var(--space-10)]">
      <div className="mx-auto max-w-[var(--page-max-width)]">
        <p
          className="text-[var(--text-lg)] leading-relaxed text-[var(--page-fg-secondary)]"
          style={{ fontFamily: "var(--page-font-body)" }}
        >
          {text}
        </p>
      </div>
    </section>
  );
}
