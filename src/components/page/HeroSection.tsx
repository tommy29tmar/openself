import type { HeroContent } from "@/lib/page-config/content-types";

type HeroSectionProps = {
  content: HeroContent;
  variant?: string;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function HeroSection({ content, variant = "large" }: HeroSectionProps) {
  const { name, tagline, avatarUrl } = content;
  const initials = getInitials(name);

  if (variant === "minimal") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-12)]">
        <div className="mx-auto max-w-[var(--page-max-width)]">
          <h1
            className="text-[var(--text-3xl)] font-bold leading-tight tracking-tight"
            style={{ fontFamily: "var(--page-font-heading)" }}
          >
            {name}
          </h1>
          <p className="mt-[var(--space-2)] text-[var(--text-lg)] text-[var(--page-fg-secondary)]">
            {tagline}
          </p>
        </div>
      </section>
    );
  }

  if (variant === "compact") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-12)]">
        <div className="mx-auto flex max-w-[var(--page-max-width)] items-center gap-[var(--space-6)]">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--page-accent)]">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[var(--text-lg)] font-semibold text-[var(--page-accent-fg)]">
                {initials}
              </span>
            )}
          </div>
          <div>
            <h1
              className="text-[var(--text-2xl)] font-bold leading-tight tracking-tight"
              style={{ fontFamily: "var(--page-font-heading)" }}
            >
              {name}
            </h1>
            <p className="mt-[var(--space-1)] text-[var(--text-base)] text-[var(--page-fg-secondary)]">
              {tagline}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Default: "large" variant
  return (
    <section className="px-[var(--space-6)] py-[var(--space-16)]">
      <div className="mx-auto flex max-w-[var(--page-max-width)] flex-col items-center text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[var(--page-accent)]">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[var(--text-2xl)] font-semibold text-[var(--page-accent-fg)]">
              {initials}
            </span>
          )}
        </div>
        <h1
          className="mt-[var(--space-6)] text-[var(--text-4xl)] font-bold leading-tight tracking-tight"
          style={{ fontFamily: "var(--page-font-heading)" }}
        >
          {name}
        </h1>
        <p className="mt-[var(--space-3)] max-w-lg text-[var(--text-xl)] text-[var(--page-fg-secondary)]">
          {tagline}
        </p>
      </div>
    </section>
  );
}
