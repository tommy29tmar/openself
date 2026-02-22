import type { SocialContent, SocialLink } from "@/lib/page-config/content-types";
import { getSocialIcon } from "@/components/icons/social-icons";

type SocialSectionProps = {
  content: SocialContent;
  variant?: string;
};

function SocialIconLink({ link }: { link: SocialLink }) {
  const Icon = getSocialIcon(link.platform);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={link.label ?? link.platform}
      className="inline-flex items-center justify-center rounded-[var(--page-radius-base)] p-[var(--space-2)] text-[var(--page-fg-secondary)] transition-colors hover:bg-[var(--page-muted)] hover:text-[var(--page-accent)]"
      style={{ transitionDuration: "var(--transition-fast)" }}
    >
      <Icon className="h-5 w-5" />
    </a>
  );
}

function SocialButtonLink({ link }: { link: SocialLink }) {
  const Icon = getSocialIcon(link.platform);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-[var(--space-2)] rounded-[var(--page-radius-base)] border border-[var(--page-card-border)] bg-[var(--page-card-bg)] px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-sm)] font-medium text-[var(--page-fg)] transition-all hover:border-[var(--page-accent)] hover:text-[var(--page-accent)]"
      style={{
        fontFamily: "var(--page-font-body)",
        transitionDuration: "var(--transition-fast)",
      }}
    >
      <Icon className="h-4 w-4" />
      {link.label ?? link.platform}
    </a>
  );
}

function SocialListLink({ link }: { link: SocialLink }) {
  const Icon = getSocialIcon(link.platform);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-[var(--space-3)] py-[var(--space-2)] text-[var(--page-fg-secondary)] transition-colors hover:text-[var(--page-accent)]"
      style={{
        fontFamily: "var(--page-font-body)",
        transitionDuration: "var(--transition-fast)",
      }}
    >
      <Icon className="h-4 w-4" />
      <span className="text-[var(--text-sm)]">{link.label ?? link.platform}</span>
    </a>
  );
}

export function SocialSection({ content, variant = "icons" }: SocialSectionProps) {
  const { links } = content;

  if (variant === "buttons") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto flex max-w-[var(--page-max-width)] flex-wrap justify-center gap-[var(--space-3)]">
          {links.map((link) => (
            <SocialButtonLink key={link.platform} link={link} />
          ))}
        </div>
      </section>
    );
  }

  if (variant === "list") {
    return (
      <section className="px-[var(--space-6)] py-[var(--space-10)]">
        <div className="mx-auto max-w-[var(--page-max-width)]">
          <div className="flex flex-col">
            {links.map((link) => (
              <SocialListLink key={link.platform} link={link} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Default: "icons" variant
  return (
    <section className="px-[var(--space-6)] py-[var(--space-10)]">
      <div className="mx-auto flex max-w-[var(--page-max-width)] flex-wrap justify-center gap-[var(--space-1)]">
        {links.map((link) => (
          <SocialIconLink key={link.platform} link={link} />
        ))}
      </div>
    </section>
  );
}
