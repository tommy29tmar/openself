export function FooterSection() {
  return (
    <footer className="px-[var(--space-6)] py-[var(--space-12)]">
      <div className="mx-auto max-w-[var(--page-max-width)]">
        <p className="text-center text-[var(--text-xs)] text-[var(--page-footer-fg)]">
          Made with{" "}
          <a
            href="https://openself.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--page-footer-fg)]/30 underline-offset-2 transition-colors hover:text-[var(--page-accent)]"
            style={{ transitionDuration: "var(--transition-fast)" }}
          >
            OpenSelf
          </a>
        </p>
      </div>
    </footer>
  );
}
