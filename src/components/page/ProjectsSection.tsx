import type { ProjectsContent, ProjectItem } from "@/lib/page-config/content-types";

type ProjectsSectionProps = {
  content: ProjectsContent;
  variant?: string;
};

function ProjectCard({ item }: { item: ProjectItem }) {
  const content = (
    <div
      className="group flex h-full flex-col rounded-[var(--page-radius-base)] border border-[var(--page-card-border)] bg-[var(--page-card-bg)] p-[var(--space-6)] transition-all hover:border-[var(--page-accent)] hover:shadow-[var(--page-shadow)]"
      style={{ transitionDuration: "var(--transition-base)" }}
    >
      <h3
        className="text-[var(--text-lg)] font-semibold text-[var(--page-fg)] transition-colors group-hover:text-[var(--page-accent)]"
        style={{
          fontFamily: "var(--page-font-heading)",
          transitionDuration: "var(--transition-fast)",
        }}
      >
        {item.title}
        {item.url && (
          <span className="ml-[var(--space-1)] inline-block opacity-0 transition-opacity group-hover:opacity-100">
            &#8599;
          </span>
        )}
      </h3>
      {item.description && (
        <p
          className="mt-[var(--space-2)] flex-1 text-[var(--text-sm)] leading-relaxed text-[var(--page-fg-secondary)]"
          style={{ fontFamily: "var(--page-font-body)" }}
        >
          {item.description}
        </p>
      )}
      {item.tags && item.tags.length > 0 && (
        <div className="mt-[var(--space-4)] flex flex-wrap gap-[var(--space-1)]">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--page-badge-bg)] px-[var(--space-2)] py-px text-[var(--text-xs)] text-[var(--page-badge-fg)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return content;
}

function ProjectListItem({ item }: { item: ProjectItem }) {
  const content = (
    <div
      className="group flex items-start gap-[var(--space-4)] rounded-[var(--page-radius-base)] border border-[var(--page-card-border)] bg-[var(--page-card-bg)] p-[var(--space-4)] transition-all hover:border-[var(--page-accent)] hover:shadow-[var(--page-shadow)]"
      style={{ transitionDuration: "var(--transition-base)" }}
    >
      <div className="flex-1">
        <h3
          className="text-[var(--text-base)] font-semibold text-[var(--page-fg)] transition-colors group-hover:text-[var(--page-accent)]"
          style={{
            fontFamily: "var(--page-font-heading)",
            transitionDuration: "var(--transition-fast)",
          }}
        >
          {item.title}
        </h3>
        {item.description && (
          <p
            className="mt-[var(--space-1)] text-[var(--text-sm)] text-[var(--page-fg-secondary)]"
            style={{ fontFamily: "var(--page-font-body)" }}
          >
            {item.description}
          </p>
        )}
      </div>
      {item.tags && item.tags.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-[var(--space-1)]">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--page-badge-bg)] px-[var(--space-2)] py-px text-[var(--text-xs)] text-[var(--page-badge-fg)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return content;
}

export function ProjectsSection({ content, variant = "grid" }: ProjectsSectionProps) {
  const { items } = content;

  if (variant === "list") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto max-w-[var(--page-max-width)] space-y-[var(--space-3)]">
          {items.map((item) => (
            <ProjectListItem key={item.title} item={item} />
          ))}
        </div>
      </section>
    );
  }

  if (variant === "featured" && items.length > 0) {
    const [featured, ...rest] = items;
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto max-w-[var(--page-max-width)] space-y-[var(--space-4)]">
          <div className="col-span-full">
            <ProjectCard item={featured} />
          </div>
          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
              {rest.map((item) => (
                <ProjectCard key={item.title} item={item} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Default: "grid" variant
  return (
    <section className="px-[var(--space-6)] py-[var(--space-10)]">
      <div className="mx-auto grid max-w-[var(--page-max-width)] grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
        {items.map((item) => (
          <ProjectCard key={item.title} item={item} />
        ))}
      </div>
    </section>
  );
}
