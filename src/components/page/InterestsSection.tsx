type InterestItem = {
  name: string;
  detail?: string;
};

type InterestsContent = {
  title?: string;
  items: InterestItem[];
};

type InterestsSectionProps = {
  content: InterestsContent;
  variant?: string;
};

export function InterestsSection({ content, variant = "chips" }: InterestsSectionProps) {
  const { title = "Interests", items } = content;

  if (variant === "list") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto max-w-[var(--page-max-width)]">
          <h3
            className="mb-[var(--space-3)] text-[var(--text-sm)] font-semibold uppercase tracking-wider text-[var(--page-fg-secondary)]"
            style={{ fontFamily: "var(--page-font-heading)" }}
          >
            {title}
          </h3>
          <ul className="space-y-[var(--space-2)]">
            {items.map((item) => (
              <li
                key={item.name}
                className="text-[var(--text-base)] text-[var(--page-fg)]"
                style={{ fontFamily: "var(--page-font-body)" }}
              >
                <span className="font-medium">{item.name}</span>
                {item.detail && (
                  <span className="text-[var(--page-fg-secondary)]">
                    {" "}
                    — {item.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  // Default: chips
  return (
    <section className="px-[var(--space-6)] py-[var(--space-10)]">
      <div className="mx-auto max-w-[var(--page-max-width)]">
        <h3
          className="mb-[var(--space-3)] text-[var(--text-sm)] font-semibold uppercase tracking-wider text-[var(--page-fg-secondary)]"
          style={{ fontFamily: "var(--page-font-heading)" }}
        >
          Interests
        </h3>
        <div className="flex flex-wrap gap-[var(--space-2)]">
          {items.map((item) => (
            <span
              key={item.name}
              className="inline-flex items-center rounded-full border border-[var(--page-badge-border)] bg-[var(--page-badge-bg)] px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-sm)] text-[var(--page-badge-fg)] transition-colors hover:border-[var(--page-accent)] hover:text-[var(--page-accent)]"
              style={{
                fontFamily: "var(--page-font-body)",
                transitionDuration: "var(--transition-fast)",
              }}
              title={item.detail}
            >
              {item.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
